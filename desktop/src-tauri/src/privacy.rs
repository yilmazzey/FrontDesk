use std::process::Command;

use serde::Serialize;

/// A strong signal that this Mac is being shared or recorded by a remote-access
/// tool. We deliberately only watch remote-desktop/recording apps: chat apps
/// such as Teams, Zoom and Slack run all day and would blur FrontDesk nonstop.
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

    ScreenShareState {
        sharing: !apps.is_empty(),
        apps,
    }
}

#[tauri::command]
pub fn screen_share_state() -> ScreenShareState {
    detect()
}
