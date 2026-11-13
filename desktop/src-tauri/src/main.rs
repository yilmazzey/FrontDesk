#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Placeholder entry point. Kept deliberately small: the webview loads the
// Vite build from tauri.conf.json, and native commands (OCR, keychain,
// Microsoft Graph) will be registered here later.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running FrontDesk");
}
