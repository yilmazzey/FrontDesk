use std::fs;
use std::path::{Path, PathBuf};

use crate::contracts::SourceGrant;

/// Grants are the only thing FrontDesk persists about access. They contain a
/// scope (folder path, fixture marker, or Microsoft source family), never content.
pub struct PermissionStore {
    path: PathBuf,
    grants: Vec<SourceGrant>,
}

impl PermissionStore {
    pub fn new(data_dir: &Path) -> Self {
        let path = data_dir.join("grants.json");
        let grants = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Vec<SourceGrant>>(&raw).ok())
            .unwrap_or_else(Self::seed);

        let store = Self { path, grants };
        store.save();
        store
    }

    fn seed() -> Vec<SourceGrant> {
        vec![SourceGrant {
            id: "fixture:desk".into(),
            kind: "file".into(),
            scope: "fixture".into(),
            title: "FrontDesk sample notes".into(),
            granted_at: chrono::Utc::now().to_rfc3339(),
        }]
    }

    pub fn list(&self) -> Vec<SourceGrant> {
        self.grants.clone()
    }

    pub fn grant(&mut self, kind: &str, scope: &str, title: &str) -> SourceGrant {
        let id = format!("{kind}:{scope}");
        if let Some(existing) = self.grants.iter().find(|g| g.id == id) {
            return existing.clone();
        }

        let grant = SourceGrant {
            id,
            kind: kind.into(),
            scope: scope.into(),
            title: title.into(),
            granted_at: chrono::Utc::now().to_rfc3339(),
        };
        self.grants.push(grant.clone());
        self.save();
        grant
    }

    pub fn revoke(&mut self, id: &str) -> bool {
        let before = self.grants.len();
        self.grants.retain(|g| g.id != id);
        let changed = before != self.grants.len();
        if changed {
            self.save();
        }
        changed
    }

    fn save(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string_pretty(&self.grants) {
            let _ = fs::write(&self.path, raw);
        }
    }
}
