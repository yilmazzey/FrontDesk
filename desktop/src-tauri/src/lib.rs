pub mod answer;
mod audit;
mod commands;
pub mod contracts;
mod embedding;
mod index;
mod manager;
mod meeting;
mod microsoft;
pub mod model;
mod model_download;
mod people_graph;
mod people_store;
mod permissions;
mod privacy;
mod retrieve;
mod runtime;
mod settings;
pub mod sources;
mod state;
mod tray;

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

            runtime::init(&data_dir);
            app.manage(state::AppState::new(data_dir, models_dir));
            app.manage(microsoft::MicrosoftState::default());
            let keep_signed_in = app
                .state::<state::AppState>()
                .settings
                .lock()
                .map(|settings| settings.get().keep_microsoft_signed_in)
                .unwrap_or(false);
            microsoft::set_keep_signed_in(keep_signed_in);
            app.manage(model_download::ModelDownloadState::default());
            tray::setup(app)?;
            Ok(())
        })
        // Closing the window keeps FrontDesk in the tray, like Ollama/Outlook.
        // Quit explicitly from the tray menu.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                // A hidden full-screen window otherwise leaves a black
                // full-screen space with no way back.
                if window.is_fullscreen().unwrap_or(false) {
                    let _ = window.set_fullscreen(false);
                }
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::list_grants,
            commands::grant_folder,
            commands::grant_fixture,
            commands::grant_microsoft_sources,
            commands::grant_web_search,
            commands::disconnect_microsoft,
            commands::revoke_grant,
            commands::list_sources,
            commands::read_source,
            commands::search_sources,
            commands::ask,
            commands::index_status,
            commands::build_index,
            commands::clear_index,
            commands::save_answer,
            commands::set_saved_folder,
            commands::list_saved,
            commands::open_saved,
            commands::reveal_path,
            commands::open_url,
            commands::open_ask,
            commands::hide_tray_popover,
            commands::open_external,
            commands::microsoft_diagnostics,
            commands::manager_snapshot,
            commands::people_graph,
            commands::people_overrides,
            commands::upsert_person,
            commands::remove_person,
            commands::export_people_graph,
            commands::import_people_graph,
            privacy::screen_share_state,
            commands::list_models,
            commands::select_model,
            commands::select_mode,
            commands::set_microsoft_client_id,
            commands::set_microsoft_tenant,
            commands::set_keep_microsoft_signed_in,
            commands::set_include_private_onenote,
            commands::warm_model,
            commands::app_info,
            commands::list_audit,
            commands::clear_audit,
            commands::open_original,
            commands::runtime_status,
            commands::install_runtime,
            commands::download_model,
            commands::cancel_model_download,
            meeting::meeting_status,
            meeting::meeting_install_model,
            meeting::meeting_start,
            meeting::meeting_stop,
            meeting::meeting_process,
            meeting::meeting_regenerate_notes,
            meeting::meeting_list,
            meeting::meeting_get,
            meeting::meeting_save,
            meeting::meeting_delete,
            meeting::meeting_reveal,
            microsoft::begin_sign_in,
            microsoft::begin_browser_sign_in,
            microsoft::poll_browser_sign_in,
            microsoft::cancel_browser_sign_in,
            microsoft::current_sign_in,
            microsoft::poll_sign_in,
            microsoft::cancel_sign_in,
            microsoft::disconnect,
            microsoft::get_profile,
        ])
        .build(tauri::generate_context!())
        .expect("error while building FrontDesk")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } = event
            {
                if !has_visible_windows {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        });
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

    // Only in a dev build: a packaged app must never look back into the
    // repository that happened to compile it. Users drop GGUF files into the
    // app-data models folder instead (Settings → Local model).
    #[cfg(debug_assertions)]
    if let Some(manifest) = option_env!("CARGO_MANIFEST_DIR") {
        let candidate = Path::new(manifest).join("../../models");
        if candidate.is_dir() {
            return candidate.canonicalize().unwrap_or(candidate);
        }
    }

    data_dir.join("models")
}
