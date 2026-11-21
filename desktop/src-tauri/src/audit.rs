use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub at: String,
    /// `grant | revoke | read | retrieve | answer | ask | clear`
    pub action: String,
    pub source_id: Option<String>,
    pub scope: Option<String>,
    /// Structured metadata for retrieval and answer provenance. Never stores
    /// source text: only source IDs, locations, scores and answer labels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<serde_json::Value>,
}

/// Metadata-only log. It records that a source was read, never what it said.
pub struct AuditLog {
    path: PathBuf,
}

impl AuditLog {
    pub fn new(data_dir: &Path) -> Self {
        let path = data_dir.join("audit.jsonl");
        Self { path }
    }

    pub fn append(&self, action: &str, source_id: Option<String>, scope: Option<String>) {
        self.append_with_detail(action, source_id, scope, None);
    }

    pub fn append_with_detail(
        &self,
        action: &str,
        source_id: Option<String>,
        scope: Option<String>,
        detail: Option<serde_json::Value>,
    ) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let entry = AuditEntry {
            at: chrono::Utc::now().to_rfc3339(),
            action: action.into(),
            source_id,
            scope,
            detail,
        };
        if let Ok(line) = serde_json::to_string(&entry) {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.path)
            {
                let _ = writeln!(file, "{line}");
            }
        }
    }

    pub fn list(&self, limit: usize) -> Vec<AuditEntry> {
        let Ok(raw) = fs::read_to_string(&self.path) else {
            return Vec::new();
        };
        let mut entries: Vec<AuditEntry> = raw
            .lines()
            .filter_map(|line| serde_json::from_str::<AuditEntry>(line).ok())
            .collect();
        entries.reverse();
        entries.truncate(limit);
        entries
    }

    pub fn clear(&self) {
        let _ = fs::write(&self.path, "");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detail_is_recorded_without_source_text() {
        let dir = std::env::temp_dir().join(format!("frontdesk-audit-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let log = AuditLog::new(&dir);

        log.append_with_detail(
            "retrieve",
            Some("file:1".into()),
            None,
            Some(serde_json::json!({
                "location": "page 1",
                "rank": 1,
                "score": 0.91,
            })),
        );
        log.append_with_detail(
            "answer",
            None,
            None,
            Some(serde_json::json!({
                "summary": "sources · 1 cited · 0 uncited · model verification",
                "verification": "model",
            })),
        );

        let entries = log.list(10);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[1].detail.as_ref().unwrap()["location"], "page 1");
        assert_eq!(entries[0].detail.as_ref().unwrap()["verification"], "model");
        assert!(!entries[0]
            .detail
            .as_ref()
            .unwrap()
            .to_string()
            .contains("Some evidence"));

        let _ = fs::remove_dir_all(&dir);
    }
}
