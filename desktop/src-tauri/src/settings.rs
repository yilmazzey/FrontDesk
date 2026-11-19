use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

fn default_mode() -> String {
    "chat".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// `None` means the extractive adapter, which needs no model at all.
    #[serde(default)]
    pub selected_model: Option<String>,
    /// `chat` may use the model's general knowledge; `grounded` answers only
    /// from the granted sources and refuses otherwise.
    #[serde(default = "default_mode")]
    pub answer_mode: String,
    /// Root folder where saved Markdown answers live. Metadata only.
    #[serde(default)]
    pub saved_folder: Option<String>,
    /// Public Microsoft Entra client ID. Not a secret; lets packaged builds
    /// sign in without baking it into the installer at build time.
    #[serde(default)]
    pub microsoft_client_id: Option<String>,
    /// True once the user explicitly chose a model or Extractive. Automatic
    /// startup selection is skipped afterwards.
    #[serde(default)]
    pub model_choice_explicit: bool,
    /// Include OneNote pages in sections whose name contains "private".
    #[serde(default)]
    pub include_private_onenote: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            selected_model: None,
            answer_mode: default_mode(),
            saved_folder: None,
            microsoft_client_id: None,
            model_choice_explicit: false,
            include_private_onenote: false,
        }
    }
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
        self.settings.model_choice_explicit = true;
        self.save();
    }

    pub fn auto_select_model(&mut self, id: Option<String>) {
        self.settings.selected_model = id;
        self.save();
    }

    pub fn set_mode(&mut self, mode: &str) {
        self.settings.answer_mode = normalize_mode(mode).to_string();
        self.save();
    }

    pub fn set_saved_folder(&mut self, folder: &str) {
        self.settings.saved_folder = Some(folder.trim().to_string());
        self.save();
    }

    pub fn set_include_private_onenote(&mut self, include: bool) {
        self.settings.include_private_onenote = include;
        self.save();
    }

    pub fn set_microsoft_client_id(&mut self, client_id: Option<&str>) {
        self.settings.microsoft_client_id = client_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        self.save();
    }

    fn save(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string_pretty(&self.settings) {
            let _ = fs::write(&self.path, raw);
        }
    }
}

pub fn normalize_mode(mode: &str) -> &'static str {
    if mode.eq_ignore_ascii_case("grounded") {
        "grounded"
    } else {
        "chat"
    }
}
