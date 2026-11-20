use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};

use crate::people_graph::PeopleGraph;

/// A local correction or addition to the live people graph. Overrides live in
/// the app data directory; they never touch Microsoft 365.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersonOverride {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub department: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub manual: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PeopleOverrides {
    #[serde(default)]
    pub people: BTreeMap<String, PersonOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeopleSnapshot {
    pub version: u32,
    pub exported_at: String,
    pub graph: PeopleGraph,
    #[serde(default)]
    pub overrides: PeopleOverrides,
}

pub struct PeopleStore {
    path: PathBuf,
    data: Mutex<PeopleOverrides>,
}

impl PeopleStore {
    pub fn new(directory: &Path) -> Self {
        let path = directory.join("people-overrides.json");
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self {
            path,
            data: Mutex::new(data),
        }
    }

    pub fn get(&self) -> PeopleOverrides {
        self.data
            .lock()
            .map(|data| data.clone())
            .unwrap_or_default()
    }

    pub fn upsert(&self, person: PersonOverride) -> PeopleOverrides {
        let mut data = match self.data.lock() {
            Ok(data) => data,
            Err(_) => return PeopleOverrides::default(),
        };
        data.people.insert(person.id.clone(), person);
        self.save(&data);
        data.clone()
    }

    pub fn remove(&self, id: &str) -> PeopleOverrides {
        let mut data = match self.data.lock() {
            Ok(data) => data,
            Err(_) => return PeopleOverrides::default(),
        };
        data.people.remove(id);
        self.save(&data);
        data.clone()
    }

    pub fn replace(&self, overrides: PeopleOverrides) -> PeopleOverrides {
        let mut data = match self.data.lock() {
            Ok(data) => data,
            Err(_) => return PeopleOverrides::default(),
        };
        *data = overrides;
        self.save(&data);
        data.clone()
    }

    fn save(&self, data: &PeopleOverrides) {
        if let Ok(text) = serde_json::to_string_pretty(data) {
            if let Err(error) = fs::write(&self.path, text) {
                eprintln!("Could not save people overrides: {error}");
            }
        }
    }
}
