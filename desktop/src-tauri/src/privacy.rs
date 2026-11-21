use std::process::Command;

use serde::Serialize;

#[cfg(target_os = "macos")]
use core_foundation::base::{CFType, TCFType};
#[cfg(target_os = "macos")]
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
#[cfg(target_os = "macos")]
use core_foundation::string::CFString;
#[cfg(target_os = "macos")]
use core_graphics::window::{
    copy_window_info, kCGNullWindowID, kCGWindowListExcludeDesktopElements,
    kCGWindowListOptionAll, kCGWindowName, kCGWindowOwnerName,
};

/// A strong signal that this Mac is being shared or recorded by a remote-access
/// tool. We deliberately only watch remote-desktop/recording apps: chat apps
/// such as Teams, Zoom and Slack run all day and would blur FrontDesk nonstop.
/// Teams is the exception, but only while a meeting window or its video-capture
/// helper is active.
const SHARE_APPS: &[(&str, &str)] = &[
    ("anydesk", "AnyDesk"),
    ("teamviewer", "TeamViewer"),
    ("rustdesk", "RustDesk"),
    ("supremo", "Supremo"),
    ("/parsec.app/", "Parsec"),
    ("screensharingd", "Screen Sharing"),
    ("cpthost", "Zoom screen share"),
    ("microsoft remote desktop", "Microsoft Remote Desktop"),
    ("ardagent", "Apple Remote Desktop"),
    ("vmware horizon", "VMware Horizon"),
    ("citrix viewer", "Citrix Viewer"),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareState {
    pub sharing: bool,
    pub apps: Vec<String>,
}

impl ScreenShareState {
    pub fn idle() -> Self {
        Self {
            sharing: false,
            apps: Vec::new(),
        }
    }
}

#[cfg(target_os = "macos")]
fn teams_label_from_titles(titles: &str) -> Option<&'static str> {
    let lower = titles.to_lowercase();
    if lower.contains("sharing control bar")
        || lower.contains("sharing indicator")
        || lower.contains("screen sharing")
    {
        Some("Microsoft Teams screen share")
    } else if lower.contains("teams meeting")
        || (lower.contains("meeting") && !lower.contains("chat"))
    {
        Some("Microsoft Teams meeting")
    } else {
        None
    }
}

/// Window titles from CoreGraphics. This works without extra permission on
/// some macOS builds; if titles are unavailable, `detect` falls back to the
/// Teams video-capture helper process.
#[cfg(target_os = "macos")]
fn teams_window_titles() -> Option<String> {
    let windows = copy_window_info(
        kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID,
    )?;
    let owner_key = unsafe { CFString::wrap_under_get_rule(kCGWindowOwnerName) };
    let name_key = unsafe { CFString::wrap_under_get_rule(kCGWindowName) };
    let mut titles = String::new();

    for index in 0..windows.len() {
        let Some(item) = windows.get(index) else {
            continue;
        };
        let dictionary: CFDictionary<CFString, CFType> =
            unsafe { CFDictionary::wrap_under_get_rule(*item as CFDictionaryRef) };
        let owner = dictionary
            .find(&owner_key)
            .and_then(|value| value.downcast::<CFString>())
            .map(|value| value.to_string())
            .unwrap_or_default()
            .to_lowercase();
        if !owner.contains("teams") {
            continue;
        }
        if let Some(name) = dictionary
            .find(&name_key)
            .and_then(|value| value.downcast::<CFString>())
            .map(|value| value.to_string())
        {
            titles.push_str(&name);
            titles.push('\n');
        }
    }

    (!titles.trim().is_empty()).then_some(titles)
}

#[cfg(target_os = "macos")]
fn teams_meeting_label() -> Option<&'static str> {
    teams_window_titles()
        .as_deref()
        .and_then(teams_label_from_titles)
}

#[cfg(not(target_os = "macos"))]
fn teams_meeting_label() -> Option<&'static str> {
    None
}

pub fn detect() -> ScreenShareState {
    if !cfg!(target_os = "macos") {
        return ScreenShareState::idle();
    }

    let output = match Command::new("ps").args(["-axo", "comm="]).output() {
        Ok(output) => output,
        Err(error) => {
            eprintln!("Screen-share detection unavailable: {error}");
            return ScreenShareState::idle();
        }
    };

    let processes = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let mut apps = Vec::new();
    for (needle, label) in SHARE_APPS {
        if processes.lines().any(|line| line.contains(needle)) && !apps.contains(&label.to_string())
        {
            apps.push((*label).to_string());
        }
    }
    let teams_running = processes
        .lines()
        .any(|line| line.contains("msteams") || line.contains("microsoft teams"));
    let process_args = Command::new("ps")
        .args(["-axo", "args="])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).to_lowercase())
        .unwrap_or_default();
    let teams_video_active = process_args.lines().any(|line| {
        line.contains("teams") && line.contains("video_capture.mojom.videocaptureservice")
    });
    let teams_label = teams_meeting_label().or_else(|| {
        (teams_running && teams_video_active).then_some("Microsoft Teams meeting")
    });
    if let Some(label) = teams_label {
        if !apps.iter().any(|app| app == label) {
            apps.push(label.to_string());
        }
    }

    ScreenShareState {
        sharing: !apps.is_empty(),
        apps,
    }
}

#[tauri::command]
pub fn screen_share_state() -> ScreenShareState {
    detect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn optional_teams_meeting_window_smoke() {
        // Environment-dependent: prints Some(...) only while a Teams meeting
        // window is on screen. Kept as a manual smoke test, not an assertion.
        println!(
            "teams window label: {:?}",
            super::teams_meeting_label()
        );
    }
}
