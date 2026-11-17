use chrono::{Duration, Utc};
use reqwest::{Response, Url};
use serde::{de::DeserializeOwned, Deserialize};

use crate::{
    contracts::{SourceGrant, SourceRef},
    microsoft::{self, MicrosoftState},
};

const PAGE_SIZE: &str = "30";
const EVENT_PAGE_SIZE: &str = "50";

#[derive(Deserialize)]
struct GraphCollection<T> {
    value: Vec<T>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MailFolder {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MailMessage {
    id: String,
    parent_folder_id: Option<String>,
    subject: Option<String>,
    from: Option<Recipient>,
    received_date_time: Option<String>,
    web_link: Option<String>,
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
struct Calendar {
    id: String,
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEvent {
    id: String,
    subject: Option<String>,
    start: Option<EventStart>,
    web_link: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventStart {
    date_time: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OneNotePage {
    id: String,
    title: Option<String>,
    last_modified_date_time: Option<String>,
    links: Option<OneNoteLinks>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OneNoteLinks {
    one_note_web_url: Option<OneNoteLink>,
}

#[derive(Deserialize)]
struct OneNoteLink {
    href: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphBody {
    content_type: Option<String>,
    content: Option<String>,
}

/// Lists only metadata. Source bodies are fetched separately when the user
/// opens a source or asks a question.
pub async fn list_graph(
    state: &MicrosoftState,
    grants: &[SourceGrant],
) -> Result<Vec<SourceRef>, String> {
    let has_microsoft_grant = grants
        .iter()
        .any(|grant| matches!(grant.kind.as_str(), "mail" | "calendar" | "onenote"));
    if !has_microsoft_grant {
        return Ok(Vec::new());
    }

    let Some(token) = microsoft::get_access_token(state).await? else {
        return Ok(Vec::new());
    };

    let deleted_items_id = if grants.iter().any(|grant| grant.kind == "mail") {
        Some(list_deleted_items_id(state, &token).await?)
    } else {
        None
    };
    let mut sources = Vec::new();

    for grant in grants {
        match grant.kind.as_str() {
            "mail" => {
                let query = [
                    ("$top", PAGE_SIZE),
                    (
                        "$select",
                        "id,parentFolderId,subject,from,receivedDateTime,webLink",
                    ),
                    ("$orderby", "receivedDateTime desc"),
                ];
                let messages: GraphCollection<MailMessage> =
                    microsoft::graph_get(state, &token, "/me/messages", &query).await?;
                sources.extend(
                    messages
                        .value
                        .into_iter()
                        .filter(|message| {
                            message.parent_folder_id.as_deref() != deleted_items_id.as_deref()
                        })
                        .map(|message| {
                            let sender = message
                                .from
                                .and_then(|recipient| recipient.email_address)
                                .and_then(|address| address.name.or(address.address));
                            let title = message
                                .subject
                                .unwrap_or_else(|| "Email without subject".to_string());
                            let title = sender
                                .filter(|sender| !sender.is_empty())
                                .map(|sender| format!("{title} — {sender}"))
                                .unwrap_or(title);
                            make_source(
                                grant,
                                "mail",
                                format!("mail:{}", encode_id(&message.id)),
                                title,
                                message.web_link.unwrap_or_else(|| "Outlook".into()),
                                message.received_date_time.unwrap_or_default(),
                                &message.id,
                            )
                        }),
                );
            }
            "calendar" => sources.extend(list_calendars(state, &token, grant).await?),
            "onenote" => {
                let query = [
                    ("$top", PAGE_SIZE),
                    ("$select", "id,title,lastModifiedDateTime,links"),
                    ("$orderby", "lastModifiedDateTime desc"),
                ];
                let pages: GraphCollection<OneNotePage> =
                    microsoft::graph_get(state, &token, "/me/onenote/pages", &query).await?;
                sources.extend(pages.value.into_iter().map(|page| {
                    let location = page
                        .links
                        .and_then(|links| links.one_note_web_url)
                        .and_then(|link| link.href)
                        .unwrap_or_else(|| "OneNote".into());
                    make_source(
                        grant,
                        "onenote",
                        format!("onenote:{}", encode_id(&page.id)),
                        page.title.unwrap_or_else(|| "Untitled OneNote page".into()),
                        location,
                        page.last_modified_date_time.unwrap_or_default(),
                        &page.id,
                    )
                }));
            }
            _ => {}
        }
    }

    Ok(sources)
}

pub async fn read_graph_source(
    state: &MicrosoftState,
    source: &SourceRef,
) -> Result<String, String> {
    let token = microsoft::get_access_token(state)
        .await?
        .ok_or_else(|| "Connect your Microsoft account to read this source.".to_string())?;

    let (body, is_html) =
        match source.kind.as_str() {
            "mail" => {
                let id = decode_id(
                    source
                        .id
                        .strip_prefix("mail:")
                        .filter(|id| !id.is_empty())
                        .ok_or_else(|| "The Microsoft source identifier is invalid.".to_string())?,
                )?;
                let url = graph_item_url(&["me", "messages", &id])?;
                let mut query = url;
                query.query_pairs_mut().append_pair("$select", "body");
                let response = microsoft::graph_send(
                    state,
                    state.client.get(query).bearer_auth(&token),
                    "Could not retrieve the Outlook message",
                )
                .await?;
                parse_body_response(response).await?
            }
            "calendar" => {
                let mut parts = source.id.split(':');
                if parts.next() != Some("calendar") {
                    return Err("The Microsoft source identifier is invalid.".into());
                }
                let calendar_id =
                    decode_id(parts.next().filter(|id| !id.is_empty()).ok_or_else(|| {
                        "The Microsoft source identifier is invalid.".to_string()
                    })?)?;
                let event_id =
                    decode_id(parts.next().filter(|id| !id.is_empty()).ok_or_else(|| {
                        "The Microsoft source identifier is invalid.".to_string()
                    })?)?;
                if parts.next().is_some() {
                    return Err("The Microsoft source identifier is invalid.".into());
                }
                let url = graph_item_url(&["me", "calendars", &calendar_id, "events", &event_id])?;
                let mut query = url;
                query.query_pairs_mut().append_pair("$select", "body");
                let response = microsoft::graph_send(
                    state,
                    state.client.get(query).bearer_auth(&token),
                    "Could not retrieve the calendar event",
                )
                .await?;
                parse_body_response(response).await?
            }
            "onenote" => {
                let id = decode_id(
                    source
                        .id
                        .strip_prefix("onenote:")
                        .filter(|id| !id.is_empty())
                        .ok_or_else(|| "The Microsoft source identifier is invalid.".to_string())?,
                )?;
                let url = graph_item_url(&["me", "onenote", "pages", &id, "content"])?;
                let response = microsoft::graph_send(
                    state,
                    state.client.get(url).bearer_auth(&token),
                    "Could not retrieve the OneNote page",
                )
                .await?;
                (microsoft::parse_graph_text(response).await?, true)
            }
            _ => return Err("That Microsoft source type is not supported.".into()),
        };

    Ok(if is_html {
        crate::sources::local_fs::strip_html(&body)
    } else {
        body
    })
}

async fn list_calendars(
    state: &MicrosoftState,
    token: &str,
    grant: &SourceGrant,
) -> Result<Vec<SourceRef>, String> {
    let query = [("$top", "20"), ("$select", "id,name")];
    let calendars: GraphCollection<Calendar> =
        microsoft::graph_get(state, token, "/me/calendars", &query).await?;
    let mut sources = Vec::new();
    let start = (Utc::now() - Duration::days(90))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let end = (Utc::now() + Duration::days(30))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();

    for calendar in calendars.value {
        let url = graph_item_url(&["me", "calendars", &calendar.id, "calendarView"])?;
        let mut query = url;
        query
            .query_pairs_mut()
            .append_pair("startDateTime", &start)
            .append_pair("endDateTime", &end)
            .append_pair("$top", EVENT_PAGE_SIZE)
            .append_pair("$select", "id,subject,start,webLink")
            // Ascending keeps the next meeting inside the page instead of
            // returning the farthest-future events first.
            .append_pair("$orderby", "start/dateTime");
        // Ask Graph for UTC so the ISO value can be parsed consistently by
        // the desktop UI regardless of the mailbox timezone.
        let response = microsoft::graph_send(
            state,
            state
                .client
                .get(query)
                .bearer_auth(token)
                .header("Prefer", "outlook.timezone=\"UTC\""),
            "Could not retrieve Microsoft Graph calendar data",
        )
        .await?;
        let events: GraphCollection<CalendarEvent> =
            microsoft::parse_graph_response(response).await?;
        let calendar_name = calendar.name.unwrap_or_else(|| "Calendar".into());
        sources.extend(events.value.into_iter().map(|event| {
            let title = event
                .subject
                .clone()
                .unwrap_or_else(|| "Untitled calendar event".into());
            let title = format!("{title} — {calendar_name}");
            let modified = event
                .start
                .as_ref()
                .and_then(|start| start.date_time.as_deref())
                .map(utc_stamp)
                .unwrap_or_default();
            make_calendar_source(grant, calendar.id.clone(), event, title, modified)
        }));
    }

    Ok(sources)
}

/// Graph returns calendar values without an offset when a `Prefer` timezone is
/// supplied. Treat them as UTC so `new Date(...)` in the UI is unambiguous.
fn utc_stamp(value: &str) -> String {
    if value.ends_with('Z') || value.contains('+') {
        value.to_string()
    } else {
        format!("{value}Z")
    }
}

fn make_calendar_source(
    grant: &SourceGrant,
    calendar_id: String,
    event: CalendarEvent,
    title: String,
    modified: String,
) -> SourceRef {
    let location = event
        .web_link
        .unwrap_or_else(|| "Microsoft Calendar".into());
    let id = format!(
        "calendar:{}:{}",
        encode_id(&calendar_id),
        encode_id(&event.id)
    );
    make_source(grant, "calendar", id, title, location, modified, &event.id)
}

fn make_source(
    grant: &SourceGrant,
    kind: &str,
    id: String,
    title: String,
    location: String,
    modified: String,
    graph_id: &str,
) -> SourceRef {
    let hash_input = format!("{graph_id}:{title}:{modified}");
    SourceRef {
        id,
        grant_id: grant.id.clone(),
        kind: kind.into(),
        title,
        location,
        modified,
        hash: crate::sources::sha256_hex(hash_input.as_bytes()),
    }
}

async fn list_deleted_items_id(state: &MicrosoftState, token: &str) -> Result<String, String> {
    let folder: MailFolder =
        microsoft::graph_get(state, token, "/me/mailFolders/deleteditems", &[]).await?;
    Ok(folder.id)
}

async fn parse_body_response(response: Response) -> Result<(String, bool), String> {
    let body: GraphBody = parse_response(response).await?;
    let is_html = body
        .content_type
        .as_deref()
        .is_some_and(|content_type| content_type.eq_ignore_ascii_case("html"));
    Ok((body.content.unwrap_or_default(), is_html))
}

async fn parse_response<T: DeserializeOwned>(response: Response) -> Result<T, String> {
    microsoft::parse_graph_response(response).await
}

fn graph_item_url(segments: &[&str]) -> Result<Url, String> {
    let mut url = Url::parse(microsoft::GRAPH_URL)
        .map_err(|error| format!("Could not build Microsoft Graph URL: {error}"))?;
    url.path_segments_mut()
        .map_err(|_| "Could not build Microsoft Graph URL.".to_string())?
        .pop_if_empty()
        .extend(segments.iter().copied());
    Ok(url)
}

fn encode_id(id: &str) -> String {
    hex::encode(id.as_bytes())
}

fn decode_id(value: &str) -> Result<String, String> {
    let bytes = hex::decode(value)
        .map_err(|_| "The Microsoft source identifier is invalid.".to_string())?;
    String::from_utf8(bytes).map_err(|_| "The Microsoft source identifier is invalid.".to_string())
}
