use std::cmp::Reverse;
use std::collections::{BTreeMap, HashMap};

use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::contracts::SourceRef;
use crate::microsoft::{self, MicrosoftState};
use crate::people_store::PeopleOverrides;
use crate::sources::{self, m365};
use crate::state::AppState;

const PEOPLE_LIMIT: usize = 200;
const MESSAGE_LIMIT: usize = 80;
const EVENT_LIMIT: usize = 120;
const NOTE_LIMIT: usize = 30;
const NOTE_TEXT_LIMIT: usize = 40_000;
const MAX_NODES: usize = 90;
const MAX_EVIDENCE: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEvidence {
    /// `profile`, `directory`, `signature`, `note` or `manual`.
    pub kind: String,
    pub title: String,
    pub detail: Option<String>,
    pub timestamp: Option<String>,
    /// Granted source id, so the UI can open the original.
    pub source_id: Option<String>,
    pub excerpt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub role: Option<String>,
    pub department: String,
    pub is_self: bool,
    pub weight: usize,
    pub mail_count: usize,
    pub meeting_count: usize,
    pub mention_count: usize,
    pub note_count: usize,
    /// A local note written by the user, not source content.
    pub note: Option<String>,
    pub edited: bool,
    pub manual: bool,
    pub evidence: Vec<GraphEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub weight: usize,
    pub kinds: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepartmentCluster {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeopleGraph {
    pub self_id: String,
    pub self_name: String,
    pub self_department: String,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub departments: Vec<DepartmentCluster>,
    pub scanned_messages: usize,
    pub scanned_events: usize,
    pub scanned_notes: usize,
    /// `graph` when live Microsoft data was read, `empty` when not connected.
    pub source: String,
    pub exported_at: Option<String>,
}

impl PeopleGraph {
    fn empty() -> Self {
        Self {
            self_id: String::new(),
            self_name: String::new(),
            self_department: String::new(),
            nodes: Vec::new(),
            edges: Vec::new(),
            departments: Vec::new(),
            scanned_messages: 0,
            scanned_events: 0,
            scanned_notes: 0,
            source: "empty".into(),
            exported_at: None,
        }
    }
}

#[derive(Default)]
struct NodeAccum {
    name: String,
    email: Option<String>,
    role: Option<String>,
    department: String,
    is_self: bool,
    manual: bool,
    note: Option<String>,
    edited: bool,
    mail: usize,
    meeting: usize,
    mention: usize,
    notes: usize,
    evidence: Vec<GraphEvidence>,
}

impl NodeAccum {
    fn weight(&self) -> usize {
        self.mail + self.meeting + self.mention + self.notes
    }
}

#[derive(Default)]
struct EdgeAccum {
    mail: usize,
    meeting: usize,
    mention: usize,
    notes: usize,
}

impl EdgeAccum {
    fn weight(&self) -> usize {
        self.mail + self.meeting + self.mention + self.notes
    }

    fn kinds(&self) -> Vec<String> {
        let mut kinds = Vec::new();
        if self.mail > 0 {
            kinds.push("mail".into());
        }
        if self.meeting > 0 {
            kinds.push("meeting".into());
        }
        if self.mention > 0 {
            kinds.push("mention".into());
        }
        if self.notes > 0 {
            kinds.push("note".into());
        }
        kinds
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Collection<T> {
    value: Vec<T>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Me {
    display_name: Option<String>,
    mail: Option<String>,
    user_principal_name: Option<String>,
    department: Option<String>,
    job_title: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Person {
    scored_email_addresses: Option<Vec<ScoredEmail>>,
    job_title: Option<String>,
    department: Option<String>,
    company_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScoredEmail {
    address: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Message {
    id: String,
    subject: Option<String>,
    from: Option<Recipient>,
    to_recipients: Option<Vec<Recipient>>,
    cc_recipients: Option<Vec<Recipient>>,
    body: Option<Body>,
    received_date_time: Option<String>,
    sent_date_time: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Event {
    attendees: Option<Vec<Attendee>>,
    organizer: Option<Recipient>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Attendee {
    email_address: Option<EmailAddress>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Recipient {
    email_address: Option<EmailAddress>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmailAddress {
    name: Option<String>,
    address: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Body {
    content: Option<String>,
}

pub async fn build(
    state: &AppState,
    microsoft_state: &MicrosoftState,
) -> Result<PeopleGraph, String> {
    let overrides = state
        .people
        .lock()
        .map(|store| store.get())
        .unwrap_or_default();

    let Some(token) = microsoft::get_access_token(microsoft_state).await? else {
        return Ok(local_graph(&overrides));
    };

    let me: Me = microsoft::graph_get(
        microsoft_state,
        &token,
        "/me",
        &[(
            "$select",
            "displayName,mail,userPrincipalName,department,jobTitle",
        )],
    )
    .await?;

    let self_email = me
        .mail
        .clone()
        .or_else(|| me.user_principal_name.clone())
        .map(|value| value.to_lowercase());
    let self_name = me
        .display_name
        .clone()
        .or_else(|| self_email.clone())
        .unwrap_or_else(|| "You".into());
    let self_department = me
        .department
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "My team".into());
    let self_key = self_email
        .clone()
        .unwrap_or_else(|| format!("name:{}", self_name.to_lowercase()));

    let directory = directory_map(microsoft_state, &token).await;

    let mut nodes: BTreeMap<String, NodeAccum> = BTreeMap::new();
    let mut edges: BTreeMap<(String, String), EdgeAccum> = BTreeMap::new();

    nodes.insert(
        self_key.clone(),
        NodeAccum {
            name: self_name.clone(),
            email: self_email.clone(),
            role: me.job_title.clone(),
            department: self_department.clone(),
            is_self: true,
            evidence: vec![GraphEvidence {
                kind: "profile".into(),
                title: "Microsoft 365 profile".into(),
                detail: [me.job_title.clone(), me.department.clone()]
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>()
                    .join(" · ")
                    .into(),
                timestamp: None,
                source_id: None,
                excerpt: None,
            }],
            ..Default::default()
        },
    );

    let mut messages = Vec::new();
    messages.extend(list_messages(microsoft_state, &token, "/me/messages").await);
    messages.extend(
        list_messages(
            microsoft_state,
            &token,
            "/me/mailFolders/sentitems/messages",
        )
        .await,
    );
    let scanned_messages = messages.len();

    for message in &messages {
        let Some(sender) = contact(message.from.as_ref().and_then(recipient_parts)) else {
            continue;
        };
        let sender_key = ensure_node(&mut nodes, &sender);
        let mut recipients = Vec::new();
        for recipient in message
            .to_recipients
            .iter()
            .flatten()
            .chain(message.cc_recipients.iter().flatten())
        {
            if let Some(person) = contact(recipient.email_address.as_ref().and_then(email_parts)) {
                recipients.push(ensure_node(&mut nodes, &person));
            }
        }
        for recipient in recipients {
            add_edge(&mut edges, &sender_key, &recipient, "mail");
        }
    }

    // Roles and departments are parsed from sender signatures. We only look at
    // the tail of the body so normal prose does not become a job title. The
    // directory remains the primary source; signatures fill its gaps.
    let mut signatures: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();
    let mut signature_evidence: HashMap<String, Vec<GraphEvidence>> = HashMap::new();
    for message in &messages {
        let Some(sender) = contact(message.from.as_ref().and_then(recipient_parts)) else {
            continue;
        };
        let Some(content) = message
            .body
            .as_ref()
            .and_then(|body| body.content.as_deref())
        else {
            continue;
        };
        let text = strip_html(content);
        if let Some((role, department)) = signature_role(&text) {
            signatures
                .entry(sender.key.clone())
                .and_modify(|entry| {
                    if entry.0.is_none() {
                        entry.0 = role.clone();
                    }
                    if entry.1.is_none() {
                        entry.1 = department.clone();
                    }
                })
                .or_insert((role.clone(), department.clone()));
            let detail = [role, department]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" · ");
            signature_evidence
                .entry(sender.key)
                .or_default()
                .push(GraphEvidence {
                    kind: "signature".into(),
                    title: message
                        .subject
                        .clone()
                        .unwrap_or_else(|| "Email signature".into()),
                    detail: Some(detail),
                    timestamp: message
                        .received_date_time
                        .clone()
                        .or_else(|| message.sent_date_time.clone()),
                    source_id: Some(format!("mail:{}", hex::encode(message.id.as_bytes()))),
                    excerpt: None,
                });
        }
    }

    let events = list_events(microsoft_state, &token).await;
    let scanned_events = events.len();
    for event in events {
        let mut keys = Vec::new();
        if let Some(organizer) = contact(event.organizer.as_ref().and_then(recipient_parts)) {
            keys.push(ensure_node(&mut nodes, &organizer));
        }
        for attendee in event.attendees.unwrap_or_default() {
            if let Some(person) = contact(attendee.email_address.as_ref().and_then(email_parts)) {
                keys.push(ensure_node(&mut nodes, &person));
            }
        }
        keys.sort();
        keys.dedup();
        for key in &keys {
            add_edge(&mut edges, &self_key, key, "meeting");
        }
    }

    // People added locally should be linkable from notes and mentions even
    // before they appear in any mailbox. Insert them before the name index.
    for (id, person) in &overrides.people {
        if nodes.contains_key(id) {
            continue;
        }
        nodes.insert(
            id.clone(),
            NodeAccum {
                name: person.name.clone().unwrap_or_else(|| "New person".into()),
                email: person.email.clone(),
                role: person.role.clone(),
                department: person
                    .department
                    .clone()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| "People I added".into()),
                manual: true,
                ..Default::default()
            },
        );
    }

    // Mentions are read from the bodies of the messages we already fetched.
    let mention_index = mention_index(&nodes);
    for message in &messages {
        let Some(sender) = contact(message.from.as_ref().and_then(recipient_parts)) else {
            continue;
        };
        let sender_key = ensure_node(&mut nodes, &sender);
        let Some(content) = message
            .body
            .as_ref()
            .and_then(|body| body.content.as_deref())
        else {
            continue;
        };
        let text = strip_html(content);
        if text.is_empty() {
            continue;
        }
        for (target, _needle) in mentions_in(&text, &mention_index) {
            if target != sender_key {
                add_edge(&mut edges, &sender_key, &target, "mention");
            }
        }
    }

    // Granted notes are first-class evidence: they link people who appear in
    // OneNote or local documents, and each link keeps its source and excerpt.
    let notes = note_sources(state, microsoft_state).await;
    let scanned_notes = notes.len();
    let mut note_edges = Vec::new();
    let mut note_evidence: Vec<(String, GraphEvidence)> = Vec::new();
    for (source, text) in &notes {
        for (target, needle) in mentions_in(text, &mention_index) {
            note_edges.push((self_key.clone(), target.clone()));
            note_evidence.push((
                target,
                GraphEvidence {
                    kind: "note".into(),
                    title: source.title.clone(),
                    detail: Some(note_label(&source.kind).into()),
                    timestamp: Some(source.modified.clone()),
                    source_id: Some(source.id.clone()),
                    excerpt: Some(snippet(text, &needle)),
                },
            ));
        }
    }
    for (source, target) in note_edges {
        add_edge(&mut edges, &source, &target, "note");
    }
    for (key, evidence) in note_evidence {
        if let Some(node) = nodes.get_mut(&key) {
            node.notes += 1;
            add_evidence(&mut node.evidence, evidence);
        }
    }

    // Directory data gives the graph its departments and job titles; a
    // signature fills the gaps for people or external guests who are missing.
    for (key, node) in nodes.iter_mut() {
        let email = node
            .email
            .clone()
            .map(|value| value.to_lowercase())
            .unwrap_or_default();
        if let Some((role, department)) = directory.get(&email) {
            if role.is_some() {
                node.role = role.clone();
            }
            if !department.is_empty() {
                node.department = department.clone();
            }
            let detail = [role.clone(), Some(department.clone())]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" · ");
            add_evidence(
                &mut node.evidence,
                GraphEvidence {
                    kind: "directory".into(),
                    title: "Microsoft 365 directory".into(),
                    detail: Some(detail),
                    timestamp: None,
                    source_id: None,
                    excerpt: None,
                },
            );
        }
        if let Some((role, department)) = signatures.get(key) {
            if node.role.is_none() {
                node.role = role.clone();
            }
            if node.department.is_empty() {
                if let Some(department) = department {
                    node.department = department.clone();
                }
            }
        }
        if let Some(items) = signature_evidence.get(key) {
            for evidence in items {
                add_evidence(&mut node.evidence, evidence.clone());
            }
        }
        if node.department.is_empty() {
            node.department = department_for(&node.email, self_email.as_deref());
        }
    }

    // Local edits always win over source data and can add people who never
    // appear in mail, calendar or notes.
    for (id, person) in &overrides.people {
        let existed = nodes.contains_key(id);
        let node = nodes.entry(id.clone()).or_insert_with(|| NodeAccum {
            name: person.name.clone().unwrap_or_else(|| "New person".into()),
            email: person.email.clone(),
            role: person.role.clone(),
            department: person
                .department
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "People I added".into()),
            manual: true,
            ..Default::default()
        });
        if !existed {
            node.manual = true;
        }
        if let Some(name) = &person.name {
            if !name.trim().is_empty() {
                node.name = name.clone();
            }
        }
        if let Some(email) = &person.email {
            if !email.trim().is_empty() {
                node.email = Some(email.clone());
            }
        }
        if let Some(role) = &person.role {
            node.role = Some(role.clone());
        }
        if let Some(department) = &person.department {
            if !department.trim().is_empty() {
                node.department = department.clone();
            }
        }
        node.note = person.note.clone().filter(|note| !note.trim().is_empty());
        node.edited = true;
        if let Some(note) = &node.note {
            add_evidence(
                &mut node.evidence,
                GraphEvidence {
                    kind: "manual".into(),
                    title: "Your note".into(),
                    detail: None,
                    timestamp: None,
                    source_id: None,
                    excerpt: Some(note.clone()),
                },
            );
        }
    }

    for node in nodes.values_mut() {
        node.evidence.sort_by(|left, right| {
            evidence_rank(&left.kind)
                .cmp(&evidence_rank(&right.kind))
                .then_with(|| right.timestamp.cmp(&left.timestamp))
        });
        node.evidence
            .dedup_by(|left, right| left.kind == right.kind && left.source_id == right.source_id);
        node.evidence.truncate(MAX_EVIDENCE);
    }

    let mut ranked: Vec<(String, NodeAccum)> = nodes.into_iter().collect();
    ranked.sort_by(|(left_key, left), (right_key, right)| {
        right
            .is_self
            .cmp(&left.is_self)
            .then(right.manual.cmp(&left.manual))
            .then(right.weight().cmp(&left.weight()))
            .then(left_key.cmp(right_key))
    });
    ranked.truncate(MAX_NODES);

    let kept: HashMap<String, ()> = ranked.iter().map(|(key, _)| (key.clone(), ())).collect();

    let graph_nodes: Vec<GraphNode> = ranked
        .into_iter()
        .map(|(key, node)| {
            let weight = node.weight();
            GraphNode {
                id: key,
                name: node.name,
                email: node.email,
                role: node.role,
                department: node.department,
                is_self: node.is_self,
                weight,
                mail_count: node.mail,
                meeting_count: node.meeting,
                mention_count: node.mention,
                note_count: node.notes,
                note: node.note,
                edited: node.edited,
                manual: node.manual,
                evidence: node.evidence,
            }
        })
        .collect();

    let mut graph_edges: Vec<GraphEdge> = edges
        .into_iter()
        .filter(|((source, target), _)| kept.contains_key(source) && kept.contains_key(target))
        .map(|((source, target), edge)| GraphEdge {
            id: format!("{source}::{target}"),
            source,
            target,
            weight: edge.weight(),
            kinds: edge.kinds(),
        })
        .collect();
    graph_edges.sort_by_key(|edge| Reverse(edge.weight));

    let mut departments: BTreeMap<String, usize> = BTreeMap::new();
    for node in &graph_nodes {
        *departments.entry(node.department.clone()).or_default() += 1;
    }
    let mut departments: Vec<DepartmentCluster> = departments
        .into_iter()
        .map(|(name, count)| DepartmentCluster { name, count })
        .collect();
    departments.sort_by_key(|department| Reverse(department.count));

    Ok(PeopleGraph {
        self_id: self_key,
        self_name,
        self_department,
        nodes: graph_nodes,
        edges: graph_edges,
        departments,
        scanned_messages,
        scanned_events,
        scanned_notes,
        source: "graph".into(),
        exported_at: None,
    })
}

fn local_graph(overrides: &PeopleOverrides) -> PeopleGraph {
    if overrides.people.is_empty() {
        return PeopleGraph::empty();
    }
    let mut nodes = Vec::new();
    for (id, person) in &overrides.people {
        let department = person
            .department
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "People I added".into());
        nodes.push(GraphNode {
            id: id.clone(),
            name: person.name.clone().unwrap_or_else(|| "New person".into()),
            email: person.email.clone(),
            role: person.role.clone(),
            department,
            is_self: false,
            weight: 0,
            mail_count: 0,
            meeting_count: 0,
            mention_count: 0,
            note_count: 0,
            note: person.note.clone().filter(|note| !note.trim().is_empty()),
            edited: true,
            manual: true,
            evidence: vec![GraphEvidence {
                kind: "manual".into(),
                title: "Your note".into(),
                detail: None,
                timestamp: None,
                source_id: None,
                excerpt: person.note.clone(),
            }],
        });
    }
    let mut departments: BTreeMap<String, usize> = BTreeMap::new();
    for node in &nodes {
        *departments.entry(node.department.clone()).or_default() += 1;
    }
    let mut departments: Vec<DepartmentCluster> = departments
        .into_iter()
        .map(|(name, count)| DepartmentCluster { name, count })
        .collect();
    departments.sort_by_key(|department| Reverse(department.count));
    PeopleGraph {
        self_id: String::new(),
        self_name: String::new(),
        self_department: String::new(),
        nodes,
        edges: Vec::new(),
        departments,
        scanned_messages: 0,
        scanned_events: 0,
        scanned_notes: 0,
        source: "graph".into(),
        exported_at: None,
    }
}

async fn directory_map(
    state: &MicrosoftState,
    token: &str,
) -> HashMap<String, (Option<String>, String)> {
    let limit = PEOPLE_LIMIT.to_string();
    let people: Collection<Person> = match microsoft::graph_get(
        state,
        token,
        "/me/people",
        &[
            ("$top", limit.as_str()),
            (
                "$select",
                "scoredEmailAddresses,jobTitle,department,companyName",
            ),
        ],
    )
    .await
    {
        Ok(people) => people,
        Err(error) => {
            eprintln!("People directory unavailable, falling back to signatures: {error}");
            return HashMap::new();
        }
    };

    let mut map = HashMap::new();
    for person in people.value {
        let Some(email) = person
            .scored_email_addresses
            .unwrap_or_default()
            .into_iter()
            .find_map(|email| email.address)
        else {
            continue;
        };
        let department = person
            .department
            .filter(|value| !value.trim().is_empty())
            .or(person.company_name)
            .unwrap_or_default();
        map.insert(email.to_lowercase(), (person.job_title, department));
    }
    map
}

async fn list_messages(state: &MicrosoftState, token: &str, path: &str) -> Vec<Message> {
    let limit = MESSAGE_LIMIT.to_string();
    let query = [
        ("$top", limit.as_str()),
        (
            "$select",
            "id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,sentDateTime",
        ),
    ];
    match microsoft::graph_get::<Collection<Message>>(state, token, path, &query).await {
        Ok(messages) => messages.value,
        Err(error) => {
            eprintln!("People graph mail unavailable: {error}");
            Vec::new()
        }
    }
}

async fn list_events(state: &MicrosoftState, token: &str) -> Vec<Event> {
    let start = (Utc::now() - Duration::days(180))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let end = (Utc::now() + Duration::days(90))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let limit = EVENT_LIMIT.to_string();
    let query = [
        ("startDateTime", start.as_str()),
        ("endDateTime", end.as_str()),
        ("$top", limit.as_str()),
        ("$select", "attendees,organizer"),
    ];
    match microsoft::graph_get::<Collection<Event>>(state, token, "/me/calendarView", &query).await
    {
        Ok(events) => events.value,
        Err(error) => {
            eprintln!("People graph calendar unavailable: {error}");
            Vec::new()
        }
    }
}

async fn note_sources(
    state: &AppState,
    microsoft_state: &MicrosoftState,
) -> Vec<(SourceRef, String)> {
    let grants = state
        .permissions
        .lock()
        .map(|grants| grants.list())
        .unwrap_or_default();
    let include_private_onenote = state
        .settings
        .lock()
        .map(|settings| settings.get().include_private_onenote)
        .unwrap_or(false);

    let mut candidates: Vec<SourceRef> = sources::list_all(&grants)
        .into_iter()
        .filter(|source| source.kind == "file" || source.kind == "ocr")
        .collect();
    candidates.extend(
        m365::list_onenote_sources(microsoft_state, &grants, include_private_onenote).await,
    );
    candidates.sort_by(|left, right| right.modified.cmp(&left.modified));
    candidates.truncate(NOTE_LIMIT);

    let mut notes = Vec::new();
    for source in candidates {
        let text = match source.kind.as_str() {
            "onenote" => m365::read_graph_source(microsoft_state, &source).await.ok(),
            _ => sources::read_text(&source).ok(),
        };
        if let Some(text) = text {
            if text.trim().is_empty() {
                continue;
            }
            let text: String = strip_html(&text).chars().take(NOTE_TEXT_LIMIT).collect();
            notes.push((source, text));
        }
    }
    notes
}

struct Contact {
    key: String,
    name: String,
    email: Option<String>,
}

fn recipient_parts(recipient: &Recipient) -> Option<(Option<String>, Option<String>)> {
    let address = recipient.email_address.as_ref()?;
    Some((address.name.clone(), address.address.clone()))
}

fn email_parts(address: &EmailAddress) -> Option<(Option<String>, Option<String>)> {
    Some((address.name.clone(), address.address.clone()))
}

fn contact(parts: Option<(Option<String>, Option<String>)>) -> Option<Contact> {
    let (name, email) = parts?;
    let email = email.filter(|value| !value.trim().is_empty());
    let name = name
        .filter(|value| !value.trim().is_empty())
        .or_else(|| email.clone())
        .unwrap_or_default();
    if name.is_empty() && email.is_none() {
        return None;
    }
    let key = email
        .as_ref()
        .map(|value| value.to_lowercase())
        .unwrap_or_else(|| format!("name:{}", name.to_lowercase()));
    Some(Contact { key, name, email })
}

fn ensure_node(nodes: &mut BTreeMap<String, NodeAccum>, contact: &Contact) -> String {
    let node = nodes
        .entry(contact.key.clone())
        .or_insert_with(|| NodeAccum {
            name: contact.name.clone(),
            email: contact.email.clone(),
            ..Default::default()
        });
    if node.name.is_empty() || node.name.starts_with("name:") {
        node.name = contact.name.clone();
    }
    if node.email.is_none() {
        node.email = contact.email.clone();
    }
    contact.key.clone()
}

fn add_edge(
    edges: &mut BTreeMap<(String, String), EdgeAccum>,
    left: &str,
    right: &str,
    kind: &str,
) {
    if left == right || left.is_empty() || right.is_empty() {
        return;
    }
    let key = if left < right {
        (left.to_string(), right.to_string())
    } else {
        (right.to_string(), left.to_string())
    };
    let edge = edges.entry(key).or_default();
    match kind {
        "mail" => edge.mail += 1,
        "meeting" => edge.meeting += 1,
        "mention" => edge.mention += 1,
        "note" => edge.notes += 1,
        _ => {}
    }
}

fn add_evidence(evidence: &mut Vec<GraphEvidence>, next: GraphEvidence) {
    if evidence.iter().any(|item| {
        item.kind == next.kind && item.source_id == next.source_id && item.title == next.title
    }) {
        return;
    }
    evidence.push(next);
}

fn evidence_rank(kind: &str) -> usize {
    match kind {
        "profile" => 0,
        "directory" => 1,
        "note" => 2,
        "signature" => 3,
        "manual" => 4,
        _ => 5,
    }
}

fn note_label(kind: &str) -> &'static str {
    match kind {
        "onenote" => "OneNote page",
        "ocr" => "Scan",
        _ => "Local note",
    }
}

fn department_for(email: &Option<String>, self_email: Option<&str>) -> String {
    let Some(email) = email else {
        return "Unassigned".into();
    };
    let domain = email.split('@').nth(1).unwrap_or_default().to_lowercase();
    let self_domain = self_email
        .and_then(|value| value.split('@').nth(1))
        .unwrap_or_default()
        .to_lowercase();
    if !self_domain.is_empty() && domain != self_domain {
        "External".into()
    } else {
        "Unassigned".into()
    }
}

const DEPARTMENTS: &[(&str, &str)] = &[
    ("commercial & marketing", "Commercial & Marketing"),
    ("commercial and marketing", "Commercial & Marketing"),
    ("corporate affairs", "Corporate Affairs"),
    ("regulatory", "Regulatory"),
    ("medical", "Medical"),
    ("finance", "Finance"),
    ("people & culture", "People"),
    ("human resources", "People"),
    ("internal it", "Internal IT"),
    ("information technology", "Internal IT"),
    ("procurement", "Procurement"),
    ("facilities", "Facilities"),
    ("supply chain", "Supply"),
    ("legal", "Legal"),
    ("events", "Events"),
];

const TITLES: &[&str] = &[
    "director",
    "manager",
    "lead",
    "advisor",
    "partner",
    "head of",
    "officer",
    "specialist",
    "associate",
    "coordinator",
    "analyst",
    "scientist",
];

fn signature_role(text: &str) -> Option<(Option<String>, Option<String>)> {
    let mut role = None;
    let mut department = None;
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    for line in lines.iter().rev().take(8) {
        let lower = line.to_lowercase();
        // Signature lines are short labels, not sentences.
        if lower.contains('@')
            || lower.contains("http")
            || lower.len() > 60
            || lower.contains('?')
            || lower.contains('!')
            || lower.ends_with('.')
            || lower.split_whitespace().count() > 8
        {
            continue;
        }
        if department.is_none() {
            for (needle, label) in DEPARTMENTS {
                if lower.contains(needle) {
                    department = Some((*label).to_string());
                    break;
                }
            }
        }
        if role.is_none() && TITLES.iter().any(|title| lower.contains(title)) {
            role = Some(line.to_string());
        }
        if role.is_some() && department.is_some() {
            break;
        }
    }
    if role.is_none() && department.is_none() {
        None
    } else {
        Some((role, department))
    }
}

fn mention_index(nodes: &BTreeMap<String, NodeAccum>) -> HashMap<String, String> {
    let mut index = HashMap::new();
    let mut first_names: HashMap<String, Vec<String>> = HashMap::new();
    for (key, node) in nodes {
        if node.is_self {
            continue;
        }
        let name = node.name.trim();
        if name.is_empty() {
            continue;
        }
        let lower = name.to_lowercase();
        if lower.len() >= 4 {
            index.insert(lower.clone(), key.clone());
        }
        if let Some(first) = lower.split_whitespace().next() {
            if first.len() >= 4 {
                first_names
                    .entry(first.to_string())
                    .or_default()
                    .push(key.clone());
            }
        }
    }
    for (first, keys) in first_names {
        if keys.len() == 1 {
            index.entry(first).or_insert_with(|| keys[0].clone());
        }
    }
    index
}

fn mentions_in(text: &str, index: &HashMap<String, String>) -> Vec<(String, String)> {
    let lower = text.to_lowercase();
    let mut hits: Vec<(String, String)> = Vec::new();
    for (needle, key) in index {
        if has_word(&lower, needle) && !hits.iter().any(|(seen, _)| seen == key) {
            hits.push((key.clone(), needle.clone()));
        }
        if hits.len() >= 8 {
            break;
        }
    }
    hits
}

fn has_word(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    let mut start = 0;
    while let Some(position) = haystack[start..].find(needle) {
        let absolute = start + position;
        let before = haystack[..absolute].chars().next_back();
        let after = haystack[absolute + needle.len()..].chars().next();
        let boundary = |value: Option<char>| value.is_none_or(|ch| !ch.is_alphanumeric());
        if boundary(before) && boundary(after) {
            return true;
        }
        start = absolute + needle.len();
    }
    false
}

fn snippet(text: &str, needle: &str) -> String {
    let lower = text.to_lowercase();
    let Some(position) = lower.find(needle) else {
        return text.chars().take(180).collect();
    };
    let start = text[..position]
        .char_indices()
        .rev()
        .nth(70)
        .map(|(index, _)| index)
        .unwrap_or(0);
    let end = text[position + needle.len()..]
        .char_indices()
        .nth(140)
        .map(|(index, _)| position + needle.len() + index)
        .unwrap_or(text.len());
    let body = text[start..end].trim().replace('\n', " ");
    format!("…{body}…")
}

fn strip_html(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::people_store::PersonOverride;

    #[test]
    fn reads_role_and_department_from_signature_tail() {
        let text = "Thanks,\n\nAnika Okafor\nSenior Brand Manager, Kestrel\nCommercial & Marketing";
        let (role, department) = signature_role(text).expect("signature");
        assert_eq!(role.as_deref(), Some("Senior Brand Manager, Kestrel"));
        assert_eq!(department.as_deref(), Some("Commercial & Marketing"));
    }

    #[test]
    fn ignores_prose_before_the_signature() {
        let text = "Can you ask the finance manager about the comparative claim? See you Monday.";
        assert!(signature_role(text).is_none());
    }

    #[test]
    fn matches_names_on_word_boundaries() {
        assert!(has_word("ask hannah about it", "hannah"));
        assert!(!has_word("hannahville", "hannah"));
        assert!(!has_word("joanne", "anne"));
    }

    #[test]
    fn mentions_are_deduplicated() {
        let mut index = HashMap::new();
        index.insert("anika".to_string(), "anika@example.com".to_string());
        index.insert("anika okafor".to_string(), "anika@example.com".to_string());
        let hits = mentions_in("Anika asked Anika Okafor to check.", &index);
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn local_graph_keeps_manual_people_when_offline() {
        let mut overrides = PeopleOverrides::default();
        overrides.people.insert(
            "manual:1".into(),
            PersonOverride {
                id: "manual:1".into(),
                name: Some("Anika Okafor".into()),
                department: Some("Commercial & Marketing".into()),
                note: Some("Met at the launch review.".into()),
                manual: true,
                ..Default::default()
            },
        );
        let graph = local_graph(&overrides);
        assert_eq!(graph.nodes.len(), 1);
        assert!(graph.nodes[0].manual);
        assert_eq!(graph.departments[0].name, "Commercial & Marketing");
        assert!(graph.nodes[0].note.is_some());
    }

    #[test]
    fn snippet_stays_near_the_name() {
        let text = "Monday steering notes. Zeynep needs two weeks to review the claim wording. Then launch.";
        let result = snippet(text, "zeynep");
        assert!(result.to_lowercase().contains("zeynep"));
        assert!(result.chars().count() < 300);
    }
}
