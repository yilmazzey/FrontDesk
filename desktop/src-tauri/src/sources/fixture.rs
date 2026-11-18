use crate::contracts::{SourceGrant, SourceRef};

const NOTES_JSON: &str = include_str!("../../../src/fixtures/notes.json");

#[derive(serde::Deserialize)]
struct FixtureNote {
    id: String,
    title: String,
    body: String,
}

fn notes() -> Vec<FixtureNote> {
    serde_json::from_str(NOTES_JSON).unwrap_or_default()
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn list(grant: &SourceGrant) -> Vec<SourceRef> {
    notes()
        .into_iter()
        .map(|note| SourceRef {
            id: format!("fixture:{}", note.id),
            grant_id: grant.id.clone(),
            kind: "file".into(),
            title: note.title,
            location: format!("fixture://{}", note.id),
            modified: now(),
            hash: super::sha256_hex(note.body.as_bytes()),
            people: Vec::new(),
        })
        .collect()
}

pub fn read(id: &str) -> Result<String, String> {
    let key = id.trim_start_matches("fixture:");
    notes()
        .into_iter()
        .find(|note| note.id == key)
        .map(|note| note.body)
        .ok_or_else(|| format!("Unknown fixture source: {id}"))
}
