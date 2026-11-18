use serde::{Deserialize, Serialize};

/// A single readable item. Never carries the body: only enough metadata to
/// decide whether it is in scope and whether it has changed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceRef {
    pub id: String,
    pub grant_id: String,
    /// `file | mail | calendar | onenote | ocr`
    pub kind: String,
    pub title: String,
    pub location: String,
    pub modified: String,
    pub hash: String,
    /// Display names from live calendar attendees. Metadata only, in memory,
    /// never persisted and never part of a citation body.
    #[serde(default)]
    pub people: Vec<String>,
}

/// A revocable permission. `scope` is a folder path, fixture marker, or
/// Microsoft source family. It is the unit Settings toggles.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceGrant {
    pub id: String,
    /// `file | mail | calendar | onenote`
    pub kind: String,
    pub scope: String,
    pub title: String,
    pub granted_at: String,
}

/// The exact text fetched from a source for one answer. Lives in memory only.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub source: SourceRef,
    /// A short, verbatim snippet around the first matched term. In memory only.
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Excerpt {
    pub source_id: String,
    pub source_type: String,
    pub title: String,
    pub location: String,
    pub timestamp: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    pub id: String,
    pub source_id: String,
    pub source_type: String,
    pub title: String,
    pub location: String,
    pub timestamp: String,
    /// Verbatim fetched text — never a model paraphrase.
    pub excerpt: String,
    pub deep_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clarification {
    pub question: String,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    /// `answered | insufficient | needs_clarification`
    pub status: String,
    pub text: String,
    pub citations: Vec<Citation>,
    pub clarification: Option<Clarification>,
    pub model: String,
    /// `sources | model | mixed | none`
    pub basis: String,
}

impl Answer {
    pub fn insufficient(model: &str) -> Self {
        Self {
            status: "insufficient".into(),
            text: "Not in your allowed sources. I only answer from what you have granted, and I did not find that there.".into(),
            citations: Vec::new(),
            clarification: None,
            model: model.into(),
            basis: "none".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRef {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    /// `gguf`
    pub kind: String,
    /// `ready | importing | unavailable`
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub data_dir: String,
    pub models_dir: String,
    pub selected_model: Option<String>,
    /// `chat | grounded`
    pub answer_mode: String,
    /// Root folder last used for saved Markdown answers.
    pub saved_folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedItem {
    pub id: String,
    pub path: String,
    pub title: String,
    pub classification: String,
    pub saved_at: String,
    pub body: String,
    pub sources: Vec<String>,
}
