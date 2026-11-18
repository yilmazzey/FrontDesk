use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Emitter, Manager,
};

/// A small menu-bar / system-tray entry, like Ollama or Outlook.
///
/// macOS and Windows open the chat on a left click. Linux tray click events
/// are not supported by AppIndicator, so there the menu is the entry point.
pub fn setup(app: &mut App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open FrontDesk", true, None::<&str>)?;
    let ask = MenuItem::with_id(app, "ask", "Ask FrontDesk", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit FrontDesk", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&ask, &open, &quit])?;

    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    let builder = TrayIconBuilder::new()
        .icon(tray_icon)
        .tooltip("FrontDesk")
        .menu(&menu)
        // On Linux the left click opens the menu; elsewhere it focuses the ask bar.
        .show_menu_on_left_click(cfg!(target_os = "linux"))
        .on_menu_event(|app, event| match event.id.as_ref() {
            "ask" => open_route(app, "frontdesk-open-ask"),
            "open" => open_route(app, "frontdesk-open-home"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                open_route(tray.app_handle(), "frontdesk-open-ask");
            }
        });

    // A template icon follows the macOS menu-bar light/dark appearance.
    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);

    builder.build(app)?;
    Ok(())
}

fn open_route(app: &tauri::AppHandle, event: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit(event, ());
    }
}
