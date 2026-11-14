use std::path::PathBuf;
use std::sync::Mutex;

use crate::audit::AuditLog;
use crate::permissions::PermissionStore;
use crate::settings::SettingsStore;

pub struct AppState {
    pub data_dir: PathBuf,
    pub models_dir: PathBuf,
    pub permissions: Mutex<PermissionStore>,
    pub settings: Mutex<SettingsStore>,
    pub audit: Mutex<AuditLog>,
}

impl AppState {
    pub fn new(data_dir: PathBuf, models_dir: PathBuf) -> Self {
        Self {
            permissions: Mutex::new(PermissionStore::new(&data_dir)),
            settings: Mutex::new(SettingsStore::new(&data_dir)),
            audit: Mutex::new(AuditLog::new(&data_dir)),
            data_dir,
            models_dir,
        }
    }
}
