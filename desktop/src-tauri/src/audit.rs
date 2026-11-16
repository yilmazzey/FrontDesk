use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub at: String,
    /// `grant | revoke | read | ask | clear`
    pub action: String,
    pub source_id: Option<String>,
    pub scope: Option<String>,
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
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let entry = AuditEntry {
            at: chrono::Utc::now().to_rfc3339(),
            action: action.into(),
            source_id,
            scope,
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
