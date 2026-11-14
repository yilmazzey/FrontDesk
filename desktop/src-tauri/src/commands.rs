use std::fs;
use std::path::PathBuf;
use std::process::Command;

use tauri::State;

use crate::answer;
use crate::audit::AuditEntry;
use crate::contracts::{Answer, AppInfo, Excerpt, ModelRef, SourceGrant, SourceRef};
use crate::model;
use crate::sources;
use crate::state::AppState;

#[tauri::command]
pub fn ping() -> String {
    "pong from the local core".into()
}

#[tauri::command]
pub fn list_grants(state: State<'_, AppState>) -> Result<Vec<SourceGrant>, String> {
    Ok(state.permissions.lock().unwrap().list())
}

#[tauri::command]
pub fn grant_folder(state: State<'_, AppState>, path: String) -> Result<SourceGrant, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Choose a folder first.".into());
    }

    let candidate = PathBuf::from(trimmed);
    if !candidate.is_dir() {
        return Err(format!("Not a readable folder: {trimmed}"));
    }

    let canonical = fs::canonicalize(&candidate).unwrap_or(candidate);
    let scope = canonical.to_string_lossy().to_string();
    let title = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Granted folder")
        .to_string();

    let grant = state
        .permissions
        .lock()
        .unwrap()
        .grant("file", &scope, &title);

    state
        .audit
        .lock()
        .unwrap()
        .append("grant", Some(grant.id.clone()), Some(scope));

    Ok(grant)
}

#[tauri::command]
pub fn grant_fixture(state: State<'_, AppState>) -> Result<SourceGrant, String> {
    let grant =
        state
            .permissions
            .lock()
            .unwrap()
            .grant("file", "fixture", "FrontDesk sample notes");

    state
        .audit
        .lock()
        .unwrap()
        .append("grant", Some(grant.id.clone()), Some("fixture".into()));

    Ok(grant)
}

#[tauri::command]
pub fn revoke_grant(state: State<'_, AppState>, id: String) -> Result<Vec<SourceGrant>, String> {
    let removed = state.permissions.lock().unwrap().revoke(&id);
    if removed {
        state.audit.lock().unwrap().append("revoke", Some(id), None);
    }
    Ok(state.permissions.lock().unwrap().list())
}

#[tauri::command]
pub fn list_sources(state: State<'_, AppState>) -> Result<Vec<SourceRef>, String> {
    let grants = state.permissions.lock().unwrap().list();
    Ok(sources::list_all(&grants))
}

#[tauri::command]
pub fn read_source(state: State<'_, AppState>, id: String) -> Result<Excerpt, String> {
    let grants = state.permissions.lock().unwrap().list();
    let source = sources::list_all(&grants)
        .into_iter()
        .find(|source| source.id == id)
        .ok_or_else(|| "That source is no longer in your allowed set.".to_string())?;

    let text = sources::read_text(&source)?;

    state.audit.lock().unwrap().append(
        "read",
        Some(source.id.clone()),
        Some(source.location.clone()),
    );

    Ok(Excerpt {
        source_id: source.id,
        source_type: source.kind,
        title: source.title,
        location: source.location,
        timestamp: source.modified,
        text,
    })
}

#[tauri::command]
pub fn ask(state: State<'_, AppState>, question: String) -> Result<Answer, String> {
    let grants = state.permissions.lock().unwrap().list();
    let settings = state.settings.lock().unwrap().get();
    let result = answer::ask(
        &question,
        &grants,
        settings.selected_model.as_deref(),
        &state.models_dir,
        &settings.answer_mode,
    );

    {
        let audit = state.audit.lock().unwrap();
        for source_id in &result.read_sources {
            audit.append("read", Some(source_id.clone()), None);
        }
        audit.append("ask", None, None);
    }

    Ok(result.answer)
}

#[tauri::command]
pub fn list_models(state: State<'_, AppState>) -> Result<Vec<ModelRef>, String> {
    Ok(model::list(&state.models_dir))
}

#[tauri::command]
pub fn select_model(state: State<'_, AppState>, id: Option<String>) -> Result<AppInfo, String> {
    let selected = id.filter(|value| !value.trim().is_empty() && value != "extractive");
    state.settings.lock().unwrap().select_model(selected);
    app_info(state)
}

#[tauri::command]
pub fn select_mode(state: State<'_, AppState>, mode: String) -> Result<AppInfo, String> {
    state.settings.lock().unwrap().set_mode(&mode);
    app_info(state)
}

#[tauri::command]
pub fn warm_model(state: State<'_, AppState>, id: String) -> Result<String, String> {
    model::warm(&state.models_dir, &id)
}

#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> Result<AppInfo, String> {
    let settings = state.settings.lock().unwrap().get();
    Ok(AppInfo {
        data_dir: state.data_dir.to_string_lossy().to_string(),
        models_dir: state.models_dir.to_string_lossy().to_string(),
        selected_model: settings.selected_model,
        answer_mode: settings.answer_mode,
    })
}

#[tauri::command]
pub fn list_audit(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<AuditEntry>, String> {
    Ok(state.audit.lock().unwrap().list(limit.unwrap_or(50)))
}

#[tauri::command]
pub fn clear_audit(state: State<'_, AppState>) -> Result<(), String> {
    let audit = state.audit.lock().unwrap();
    audit.clear();
    audit.append("clear", None, None);
    Ok(())
}

#[tauri::command]
pub fn open_original(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let grants = state.permissions.lock().unwrap().list();
    let source = sources::list_all(&grants)
        .into_iter()
        .find(|source| source.id == id)
        .ok_or_else(|| "That source is no longer available.".to_string())?;

    if source.location.starts_with("fixture://") {
        return Err("This is a built-in sample source; there is no original file.".into());
    }

    open_path(&source.location)
}

fn open_path(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(path).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", "", path]).status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(path).status();

    status
        .map_err(|e| format!("Could not open the original: {e}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "The original could not be opened.".to_string())
}
