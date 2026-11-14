use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// `None` means the extractive adapter, which needs no model at all.
    pub selected_model: Option<String>,
}

pub struct SettingsStore {
    path: PathBuf,
    settings: Settings,
}

impl SettingsStore {
    pub fn new(data_dir: &Path) -> Self {
        let path = data_dir.join("settings.json");
        let settings = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
            .unwrap_or_default();
        Self { path, settings }
    }

    pub fn get(&self) -> Settings {
        self.settings.clone()
    }

    pub fn select_model(&mut self, id: Option<String>) {
        self.settings.selected_model = id;
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string_pretty(&self.settings) {
            let _ = fs::write(&self.path, raw);
        }
    }
}
