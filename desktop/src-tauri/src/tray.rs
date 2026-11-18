use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};

/// A menu-bar / system-tray entry with a compact Outlook-style popover.
///
/// The native menu bar cannot host a text field, so the tray icon opens a
/// small borderless window. Its Ask bar launches the main app's chat, and the
/// popover shows the next three calendar items. Linux tray click events are
/// not exposed by AppIndicator, so there the menu is the entry point.
pub fn setup(app: &mut App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open FrontDesk", true, None::<&str>)?;
    let ask = MenuItem::with_id(app, "ask", "Ask FrontDesk", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit FrontDesk", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&ask, &open, &quit])?;

    let popover =
        WebviewWindowBuilder::new(app, "tray", WebviewUrl::App("index.html#/tray".into()))
            .title("FrontDesk")
            .inner_size(390.0, 560.0)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(true)
            .visible(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .focused(false)
            .build()?;

    let last_hidden = Arc::new(Mutex::new(None::<Instant>));

    let hide_handle = popover.clone();
    let hide_last = last_hidden.clone();
    popover.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = hide_handle.hide();
            if let Ok(mut slot) = hide_last.lock() {
                *slot = Some(Instant::now());
            }
        }
    });

    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    let tray_last = last_hidden.clone();
    let builder = TrayIconBuilder::new()
        .icon(tray_icon)
        .tooltip("FrontDesk · Ask")
        .menu(&menu)
        .show_menu_on_left_click(cfg!(target_os = "linux"))
        .on_menu_event(|app, event| match event.id.as_ref() {
            "ask" => open_main_ask(app, None),
            "open" => open_route(app, "frontdesk-open-home"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                toggle_popover(
                    tray.app_handle(),
                    Some((position.x, position.y)),
                    &tray_last,
                );
            }
        });

    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);

    builder.build(app)?;
    Ok(())
}

fn toggle_popover(
    app: &tauri::AppHandle,
    anchor: Option<(f64, f64)>,
    last_hidden: &Arc<Mutex<Option<Instant>>>,
) {
    let Some(window) = app.get_webview_window("tray") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        if let Ok(mut slot) = last_hidden.lock() {
            *slot = Some(Instant::now());
        }
        return;
    }
    if last_hidden
        .lock()
        .ok()
        .and_then(|slot| *slot)
        .is_some_and(|at| at.elapsed() < Duration::from_millis(350))
    {
        return;
    }
    if let Some((icon_x, icon_y)) = anchor {
        let size = window
            .outer_size()
            .unwrap_or(tauri::PhysicalSize::new(390, 560));
        let screen_height = window
            .current_monitor()
            .ok()
            .flatten()
            .map(|monitor| monitor.size().height as f64)
            .unwrap_or(900.0);
        let x = icon_x - size.width as f64 / 2.0;
        let y = if icon_y < screen_height / 2.0 {
            icon_y + 8.0
        } else {
            icon_y - size.height as f64 - 8.0
        };
        let _ = window.set_position(PhysicalPosition::new(x.max(8.0), y.max(8.0)));
    }
    let _ = window.show();
    let _ = window.set_focus();
    if let Ok(mut slot) = last_hidden.lock() {
        *slot = None;
    }
}

pub fn open_main_ask(app: &tauri::AppHandle, question: Option<String>) {
    hide_popover(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("frontdesk-open-question", question.unwrap_or_default());
    }
}

pub fn hide_popover(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("tray") {
        let _ = window.hide();
    }
}

fn open_route(app: &tauri::AppHandle, event: &str) {
    hide_popover(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit(event, ());
    }
}
