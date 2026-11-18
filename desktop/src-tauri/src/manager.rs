use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Utc};
use futures_util::stream::{self, StreamExt};
use serde::Serialize;

use crate::contracts::SourceRef;
use crate::microsoft::MicrosoftState;
use crate::sources;
use crate::sources::m365;
use crate::state::AppState;

const RECENT_DAYS: i64 = 120;
const LOOP_DAYS: i64 = 45;
const LOCAL_READ_LIMIT: usize = 24;
const GRAPH_READ_LIMIT: usize = 10;
const CATCH_UP_DAYS: i64 = 30;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSnippet {
    pub source_id: String,
    pub title: String,
    pub timestamp: String,
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonPulse {
    pub name: String,
    pub last_met: Option<String>,
    pub next_met: Option<String>,
    pub meeting_count: usize,
    pub due: bool,
    pub note: Option<NoteSnippet>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenLoop {
    pub id: String,
    /// `mine` means you owe someone; `waiting` means you are blocked on them.
    pub direction: String,
    pub text: String,
    pub person: Option<String>,
    pub source_id: String,
    pub source_title: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextUp {
    pub source: SourceRef,
    pub people: Vec<PersonPulse>,
    pub actions: Vec<OpenLoop>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerSnapshot {
    pub next_up: Option<NextUp>,
    pub people: Vec<PersonPulse>,
    pub open_loops: Vec<OpenLoop>,
    pub scanned_sources: usize,
}

struct Accum {
    name: String,
    last_met: Option<DateTime<Utc>>,
    next_met: Option<DateTime<Utc>>,
    count: usize,
    note: Option<NoteSnippet>,
}

pub async fn snapshot(
    state: &AppState,
    microsoft_state: &MicrosoftState,
    self_name: Option<&str>,
) -> Result<ManagerSnapshot, String> {
    let grants = state.permissions.lock().unwrap().list();
    let mut all_sources = sources::list_all(&grants);
    if let Ok(graph) = m365::list_graph(microsoft_state, &grants).await {
        all_sources.extend(graph);
    }

    let now = Utc::now();
    let self_key = self_name.map(|name| name.trim().to_lowercase());

    let mut events: Vec<(SourceRef, DateTime<Utc>)> = all_sources
        .iter()
        .filter(|source| source.kind == "calendar")
        .filter_map(|source| parse_stamp(&source.modified).map(|start| (source.clone(), start)))
        .collect();
    events.sort_by_key(|(_, start)| *start);

    let known_people = people_names(&events, self_key.as_deref());
    let mut people: BTreeMap<String, Accum> = BTreeMap::new();

    for (source, start) in &events {
        for raw in &source.people {
            let name = raw.trim();
            if name.is_empty() || is_self(name, self_key.as_deref()) {
                continue;
            }
            let key = name.to_lowercase();
            let entry = people.entry(key).or_insert_with(|| Accum {
                name: name.to_string(),
                last_met: None,
                next_met: None,
                count: 0,
                note: None,
            });
            entry.count += 1;
            if *start <= now && entry.last_met.is_none_or(|previous| *start > previous) {
                entry.last_met = Some(*start);
            }
            if *start >= now && entry.next_met.is_none_or(|previous| *start < previous) {
                entry.next_met = Some(*start);
            }
        }
    }

    let next_event = events
        .iter()
        .find(|(_, start)| *start >= now - Duration::minutes(30))
        .cloned();

    let recent = recent_sources(&all_sources, now);
    let (texts, scanned_sources) = read_recent(microsoft_state, recent).await;

    let mut loops = Vec::new();
    for (source, text) in &texts {
        let haystack = format!("{} {}", source.title, text).to_lowercase();
        for (key, entry) in people.iter_mut() {
            if (haystack.contains(key) || contains_first_name(&haystack, &entry.name))
                && entry
                    .note
                    .as_ref()
                    .is_none_or(|note| source.modified > note.timestamp)
            {
                if let Some(excerpt) = note_snippet(text, &entry.name) {
                    entry.note = Some(NoteSnippet {
                        source_id: source.id.clone(),
                        title: source.title.clone(),
                        timestamp: source.modified.clone(),
                        excerpt,
                    });
                }
            }
        }
        loops.extend(extract_loops(source, text, &known_people));
    }

    loops.sort_by(|left, right| right.timestamp.cmp(&left.timestamp));
    loops.truncate(12);

    let due_cutoff = now - Duration::days(CATCH_UP_DAYS);
    let mut people: Vec<PersonPulse> = people
        .into_values()
        .map(|entry| PersonPulse {
            due: entry.last_met.is_none_or(|last| last < due_cutoff),
            name: entry.name,
            last_met: entry.last_met.map(|date| date.to_rfc3339()),
            next_met: entry.next_met.map(|date| date.to_rfc3339()),
            meeting_count: entry.count,
            note: entry.note,
        })
        .collect();
    people.sort_by(|left, right| {
        right
            .due
            .cmp(&left.due)
            .then_with(|| left.last_met.cmp(&right.last_met))
            .then_with(|| left.name.cmp(&right.name))
    });

    let next_up = next_event.map(|(source, _)| {
        let attendees: Vec<PersonPulse> = source
            .people
            .iter()
            .filter_map(|name| {
                people
                    .iter()
                    .find(|person| person.name.eq_ignore_ascii_case(name.trim()))
                    .cloned()
            })
            .collect();
        let attendee_keys: Vec<String> = attendees
            .iter()
            .map(|person| person.name.to_lowercase())
            .collect();
        let actions = loops
            .iter()
            .filter(|item| {
                item.person
                    .as_ref()
                    .is_some_and(|person| attendee_keys.contains(&person.to_lowercase()))
                    || attendee_keys
                        .iter()
                        .any(|name| item.source_title.to_lowercase().contains(name))
            })
            .take(4)
            .cloned()
            .collect();
        NextUp {
            source,
            people: attendees,
            actions,
        }
    });

    Ok(ManagerSnapshot {
        next_up,
        people,
        open_loops: loops,
        scanned_sources,
    })
}

fn recent_sources(all: &[SourceRef], now: DateTime<Utc>) -> Vec<SourceRef> {
    let cutoff = now - Duration::days(RECENT_DAYS);
    let mut recent: Vec<SourceRef> = all
        .iter()
        .filter(|source| source.kind != "calendar")
        .filter(|source| parse_stamp(&source.modified).is_some_and(|date| date >= cutoff))
        .cloned()
        .collect();
    recent.sort_by(|left, right| right.modified.cmp(&left.modified));

    let local: Vec<SourceRef> = recent
        .iter()
        .filter(|source| matches!(source.kind.as_str(), "file" | "ocr"))
        .take(LOCAL_READ_LIMIT)
        .cloned()
        .collect();
    let graph: Vec<SourceRef> = recent
        .iter()
        .filter(|source| matches!(source.kind.as_str(), "mail" | "onenote"))
        .take(GRAPH_READ_LIMIT)
        .cloned()
        .collect();
    local.into_iter().chain(graph).collect()
}

async fn read_recent(
    microsoft_state: &MicrosoftState,
    recent: Vec<SourceRef>,
) -> (Vec<(SourceRef, String)>, usize) {
    let mut texts = Vec::new();
    for source in recent
        .iter()
        .filter(|source| matches!(source.kind.as_str(), "file" | "ocr") && source.kind != "mail")
    {
        if let Ok(text) = sources::read_text(source) {
            if !text.trim().is_empty() {
                texts.push((source.clone(), text));
            }
        }
    }

    let graph_results = stream::iter(
        recent
            .into_iter()
            .filter(|source| matches!(source.kind.as_str(), "mail" | "onenote")),
    )
    .map(|source| async move {
        m365::read_graph_source(microsoft_state, &source)
            .await
            .ok()
            .filter(|text| !text.trim().is_empty())
            .map(|text| (source, text))
    })
    .buffer_unordered(2)
    .filter_map(|item| async move { item })
    .collect::<Vec<_>>()
    .await;

    texts.extend(graph_results);
    let scanned = texts.len();
    (texts, scanned)
}

fn people_names(events: &[(SourceRef, DateTime<Utc>)], self_key: Option<&str>) -> Vec<String> {
    let mut names = Vec::new();
    for (source, _) in events {
        for raw in &source.people {
            let name = raw.trim();
            if name.is_empty() || is_self(name, self_key) {
                continue;
            }
            if !names
                .iter()
                .any(|known: &String| known.eq_ignore_ascii_case(name))
            {
                names.push(name.to_string());
            }
        }
    }
    names
}

fn is_self(name: &str, self_key: Option<&str>) -> bool {
    self_key.is_some_and(|key| name.trim().to_lowercase() == key)
}

fn contains_first_name(haystack: &str, full_name: &str) -> bool {
    let Some(first) = full_name.split_whitespace().next() else {
        return false;
    };
    if first.chars().count() < 3 {
        return false;
    }
    let first = first.to_lowercase();
    haystack
        .split(|character: char| !character.is_alphanumeric())
        .any(|word| word == first)
}

fn note_snippet(text: &str, name: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let first = name
        .split_whitespace()
        .next()
        .unwrap_or(name)
        .to_lowercase();
    let offset = lower
        .find(&name.to_lowercase())
        .or_else(|| lower.find(&first));
    let start = floor_boundary(text, offset.unwrap_or(0).saturating_sub(110));
    let end = ceil_boundary(text, (offset.unwrap_or(0) + 190).min(text.len()));
    let raw = text[start..end]
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if raw.is_empty() {
        return None;
    }
    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < text.len() { "…" } else { "" };
    Some(format!("{prefix}{raw}{suffix}"))
}

fn floor_boundary(text: &str, mut index: usize) -> usize {
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_boundary(text: &str, mut index: usize) -> usize {
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn extract_loops(source: &SourceRef, text: &str, known_people: &[String]) -> Vec<OpenLoop> {
    let mut loops = Vec::new();
    for segment in text.split(|character: char| matches!(character, '\n' | '.' | '!' | '?' | ';')) {
        let mut cleaned = segment.trim();
        cleaned = cleaned.trim_start_matches(|character: char| {
            matches!(character, '-' | '*' | '•' | ' ' | '\t')
        });
        let checkbox = cleaned.starts_with("[ ]");
        if checkbox {
            cleaned = cleaned[3..].trim();
        }
        if cleaned.len() < 12 || cleaned.len() > 280 {
            continue;
        }
        let lower = cleaned.to_lowercase();
        if lower.contains("[x]") {
            continue;
        }

        let waiting = lower.contains("waiting on")
            || lower.contains("waiting for")
            || lower.contains("awaiting")
            || lower.contains("blocked on")
            || (lower.contains("need") && lower.contains(" from "));
        let mine = checkbox
            || lower.starts_with("todo")
            || lower.starts_with("action")
            || lower.contains("i'll")
            || lower.contains("i will")
            || lower.contains("we'll")
            || lower.contains("we will")
            || lower.contains("i need to")
            || lower.contains("i have to")
            || lower.contains("i must")
            || lower.contains("i owe")
            || lower.contains("promised")
            || lower.contains("follow up")
            || lower.contains("follow-up")
            || lower.contains("next step");
        if !waiting && !mine {
            continue;
        }

        let text = cleaned.trim();
        let normalized = text.to_lowercase();
        if loops
            .iter()
            .any(|existing: &OpenLoop| existing.text.to_lowercase() == normalized)
        {
            continue;
        }

        let title = source.title.to_lowercase();
        let person = known_people
            .iter()
            .find(|name| {
                normalized.contains(&name.to_lowercase()) || contains_first_name(&normalized, name)
            })
            .or_else(|| {
                known_people
                    .iter()
                    .find(|name| title.contains(&name.to_lowercase()))
            });
        loops.push(OpenLoop {
            id: format!("{}:{}", source.id, loops.len()),
            direction: if waiting {
                "waiting".into()
            } else {
                "mine".into()
            },
            text: text.to_string(),
            person: person.cloned(),
            source_id: source.id.clone(),
            source_title: source.title.clone(),
            timestamp: source.modified.clone(),
        });
    }

    loops.retain(|item| {
        parse_stamp(&item.timestamp)
            .is_some_and(|date| date >= Utc::now() - Duration::days(LOOP_DAYS))
    });
    loops
}

fn parse_stamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.with_timezone(&Utc))
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S")
                .ok()
                .map(|date| date.and_utc())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(title: &str) -> SourceRef {
        SourceRef {
            id: "note:1".into(),
            grant_id: "file:notes".into(),
            kind: "file".into(),
            title: title.into(),
            location: "note.md".into(),
            modified: Utc::now().to_rfc3339(),
            hash: "hash".into(),
            people: Vec::new(),
        }
    }

    #[test]
    fn extracts_commitments_and_waiting_items() {
        let note = source("1:1 — Priya Shah");
        let text = "Priya owns the launch scope. I promised to send the revised scope by Friday. Waiting on Priya for the budget sign-off. Follow up with Marcus on the vendor shortlist.";
        let loops = extract_loops(&note, text, &["Priya Shah".into(), "Marcus Lee".into()]);
        assert_eq!(loops.len(), 3);
        assert!(loops.iter().any(
            |item| item.direction == "waiting" && item.person.as_deref() == Some("Priya Shah")
        ));
        assert!(loops
            .iter()
            .any(|item| item.direction == "mine" && item.person.as_deref() == Some("Priya Shah")));
        assert!(loops
            .iter()
            .any(|item| item.direction == "mine" && item.person.as_deref() == Some("Marcus Lee")));
    }

    #[test]
    fn ignores_checked_items_and_generic_prose() {
        let note = source("Weekly review");
        let text = "- [x] Send the deck\n- [ ] Draft the hiring plan\nWe had a useful conversation about scope.";
        let loops = extract_loops(&note, text, &[]);
        assert_eq!(loops.len(), 1);
        assert_eq!(loops[0].text, "Draft the hiring plan");
        assert_eq!(loops[0].direction, "mine");
    }

    #[test]
    fn parses_graph_timestamps_without_an_offset() {
        let stamp = parse_stamp("2026-11-17T09:30:00").unwrap();
        assert_eq!(stamp.to_rfc3339(), "2026-11-17T09:30:00+00:00");
    }

    #[test]
    fn snapshot_surfaces_fixture_commitments_without_a_calendar() {
        let dir = std::env::temp_dir().join(format!(
            "frontdesk-manager-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let state = crate::state::AppState::new(dir.clone(), dir.join("models"));
        state
            .permissions
            .lock()
            .unwrap()
            .grant("file", "fixture", "FrontDesk sample notes");
        let microsoft = MicrosoftState::default();

        let snapshot = tauri::async_runtime::block_on(snapshot(&state, &microsoft, None)).unwrap();
        assert!(snapshot.next_up.is_none());
        assert!(snapshot
            .open_loops
            .iter()
            .any(|item| item.text.contains("revised scope")));
        assert!(snapshot
            .open_loops
            .iter()
            .any(|item| item.direction == "waiting" && item.text.contains("budget sign-off")));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
