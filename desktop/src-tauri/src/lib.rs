pub mod answer;
mod audit;
mod commands;
pub mod contracts;
pub mod model;
mod permissions;
mod retrieve;
mod settings;
pub mod sources;
mod state;

use std::path::{Path, PathBuf};

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let models_dir = resolve_models_dir(&data_dir);
            std::fs::create_dir_all(&models_dir)?;

            app.manage(state::AppState::new(data_dir, models_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::list_grants,
            commands::grant_folder,
            commands::grant_fixture,
            commands::revoke_grant,
            commands::list_sources,
            commands::read_source,
            commands::ask,
            commands::list_models,
            commands::select_model,
            commands::select_mode,
            commands::warm_model,
            commands::app_info,
            commands::list_audit,
            commands::clear_audit,
            commands::open_original,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FrontDesk");
}

/// In development the GGUF folder lives at the repo root. In a packaged build
/// it falls back to the app data directory, which is where the Settings page
/// tells the user to drop models.
fn resolve_models_dir(data_dir: &Path) -> PathBuf {
    if let Ok(value) = std::env::var("FRONTDESK_MODELS_DIR") {
        if !value.trim().is_empty() {
            return PathBuf::from(value);
        }
    }

    if let Some(manifest) = option_env!("CARGO_MANIFEST_DIR") {
        let candidate = Path::new(manifest).join("../../models");
        if candidate.is_dir() {
            return candidate.canonicalize().unwrap_or(candidate);
        }
    }

    data_dir.join("models")
}
