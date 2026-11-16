#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod microsoft;

fn main() {
    tauri::Builder::default()
        .manage(microsoft::MicrosoftState::default())
        .invoke_handler(tauri::generate_handler![
            microsoft::begin_sign_in,
            microsoft::poll_sign_in,
            microsoft::cancel_sign_in,
            microsoft::disconnect,
            microsoft::get_profile,
            microsoft::get_dashboard_data,
            microsoft::load_microsoft_sources,
            microsoft::answer_with_local_model,
            microsoft::check_local_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FrontDesk");
}
