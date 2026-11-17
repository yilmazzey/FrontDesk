use std::fs;
use std::path::PathBuf;
use std::process::Command;

use futures_util::stream::{self, StreamExt};
use reqwest::Url;
use tauri::State;

use crate::answer;
use crate::audit::AuditEntry;
use crate::contracts::{Answer, AppInfo, Excerpt, ModelRef, SourceGrant, SourceRef};
use crate::microsoft::{self, MicrosoftState};
use crate::model;
use crate::runtime;
use crate::sources;
use crate::sources::m365;
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
pub async fn grant_microsoft_sources(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
) -> Result<Vec<SourceGrant>, String> {
    if microsoft::get_access_token(&microsoft_state)
        .await?
        .is_none()
    {
        return Err("Connect your Microsoft account before granting its sources.".into());
    }

    let mut permissions = state.permissions.lock().unwrap();
    let grants = [
        ("mail", "mailbox", "Microsoft Outlook"),
        ("calendar", "calendar", "Microsoft Calendar"),
        ("onenote", "notebooks", "Microsoft OneNote"),
    ]
    .into_iter()
    .map(|(kind, scope, title)| permissions.grant(kind, scope, title))
    .collect::<Vec<_>>();
    for grant in &grants {
        state.audit.lock().unwrap().append(
            "grant",
            Some(grant.id.clone()),
            Some(grant.scope.clone()),
        );
    }
    Ok(permissions.list())
}

#[tauri::command]
pub fn disconnect_microsoft(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
) -> Result<Vec<SourceGrant>, String> {
    microsoft::clear_auth(&microsoft_state)?;
    let mut permissions = state.permissions.lock().unwrap();
    let ids = permissions
        .list()
        .into_iter()
        .filter(|grant| matches!(grant.kind.as_str(), "mail" | "calendar" | "onenote"))
        .map(|grant| grant.id)
        .collect::<Vec<_>>();
    for id in ids {
        permissions.revoke(&id);
        state.audit.lock().unwrap().append("revoke", Some(id), None);
    }
    Ok(permissions.list())
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
pub async fn list_sources(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
) -> Result<Vec<SourceRef>, String> {
    let grants = state.permissions.lock().unwrap().list();
    let mut all = sources::list_all(&grants);
    // Live connectors must never hide local sources. If Microsoft is offline
    // or the token expired, the local desk keeps working.
    match m365::list_graph(&microsoft_state, &grants).await {
        Ok(graph) => all.extend(graph),
        Err(error) => eprintln!("Microsoft sources unavailable: {error}"),
    }
    all.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(all)
}

#[tauri::command]
pub async fn read_source(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
    id: String,
) -> Result<Excerpt, String> {
    let grants = state.permissions.lock().unwrap().list();
    // Look for a local source first so reading a file never depends on Graph.
    let local = sources::list_all(&grants)
        .into_iter()
        .find(|source| source.id == id);
    let source = match local {
        Some(source) => source,
        None => m365::list_graph(&microsoft_state, &grants)
            .await?
            .into_iter()
            .find(|source| source.id == id)
            .ok_or_else(|| "That source is no longer in your allowed set.".to_string())?,
    };

    let text = if matches!(source.kind.as_str(), "mail" | "calendar" | "onenote") {
        m365::read_graph_source(&microsoft_state, &source).await?
    } else {
        sources::read_text(&source)?
    };

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
pub async fn search_sources(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
    query: String,
) -> Result<Vec<SourceRef>, String> {
    let query = query.trim();
    if query.is_empty() || query.len() > 200 {
        return Err("Enter a search term under 200 characters.".into());
    }
    let terms = search_terms(query);
    if terms.is_empty() {
        return Ok(Vec::new());
    }

    let grants = state.permissions.lock().unwrap().list();
    let mut all_sources = sources::list_all(&grants);
    match m365::list_graph(&microsoft_state, &grants).await {
        Ok(graph) => all_sources.extend(graph),
        Err(error) => eprintln!("Microsoft search unavailable: {error}"),
    }
    let (graph_sources, local_sources): (Vec<_>, Vec<_>) = all_sources
        .into_iter()
        .partition(|source| matches!(source.kind.as_str(), "mail" | "calendar" | "onenote"));

    let mut matches = Vec::new();
    for source in local_sources {
        let text = sources::read_text(&source)?;
        state.audit.lock().unwrap().append(
            "read",
            Some(source.id.clone()),
            Some(source.location.clone()),
        );
        if matches_terms(
            &terms,
            &format!(
                "{} {} {} {}",
                source.title, source.location, source.kind, text
            ),
        ) {
            matches.push(source);
        }
    }

    let microsoft_state_ref = &microsoft_state;
    let terms_ref = &terms;
    let audit = &state.audit;
    let graph_matches = stream::iter(graph_sources)
        .map(|source| async move {
            let text = match m365::read_graph_source(microsoft_state_ref, &source).await {
                Ok(text) => text,
                Err(error) => {
                    eprintln!("Skipping Microsoft source {}: {error}", source.id);
                    return None;
                }
            };
            audit.lock().unwrap().append(
                "read",
                Some(source.id.clone()),
                Some(source.location.clone()),
            );
            if matches_terms(
                terms_ref,
                &format!(
                    "{} {} {} {}",
                    source.title, source.location, source.kind, text
                ),
            ) {
                Some(source)
            } else {
                None
            }
        })
        .buffer_unordered(2)
        .filter_map(|item| async move { item })
        .collect::<Vec<_>>()
        .await;
    matches.extend(graph_matches);
    matches.sort_by(|a, b| b.modified.cmp(&a.modified));
    state.audit.lock().unwrap().append("search", None, None);
    Ok(matches)
}

#[tauri::command]
pub async fn ask(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
    question: String,
) -> Result<Answer, String> {
    let grants = state.permissions.lock().unwrap().list();
    let settings = state.settings.lock().unwrap().get();
    let graph_sources = match m365::list_graph(&microsoft_state, &grants).await {
        Ok(sources) => sources,
        Err(error) => {
            eprintln!("Microsoft sources unavailable, answering locally: {error}");
            Vec::new()
        }
    };
    let microsoft_state_ref = &microsoft_state;
    let graph_documents = stream::iter(graph_sources)
        .map(|source| async move {
            let text = match m365::read_graph_source(microsoft_state_ref, &source).await {
                Ok(text) => text,
                Err(error) => {
                    eprintln!("Skipping Microsoft source {}: {error}", source.id);
                    return None;
                }
            };
            let metadata = match source.kind.as_str() {
                "mail" => format!("Email: {}\nReceived: {}", source.title, source.modified),
                "calendar" => {
                    format!(
                        "Calendar event: {}\nStarts: {}",
                        source.title, source.modified
                    )
                }
                "onenote" => {
                    format!(
                        "OneNote page: {}\nModified: {}",
                        source.title, source.modified
                    )
                }
                _ => String::new(),
            };
            Some((source, format!("{metadata}\n\n{text}")))
        })
        .buffer_unordered(2)
        .filter_map(|item| async move { item })
        .collect::<Vec<_>>()
        .await;
    let result = answer::ask_with_external(
        &question,
        &grants,
        &graph_documents,
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

fn search_terms(query: &str) -> Vec<String> {
    query
        .split(|character: char| !character.is_alphanumeric())
        .filter(|term| !term.is_empty())
        .map(str::to_lowercase)
        .collect()
}

fn matches_terms(terms: &[String], text: &str) -> bool {
    let words = text
        .split(|character: char| !character.is_alphanumeric())
        .map(str::to_lowercase)
        .collect::<std::collections::HashSet<_>>();
    terms.iter().all(|term| words.contains(term))
}

#[cfg(test)]
mod tests {
    use super::{matches_terms, search_terms};

    #[test]
    fn content_search_matches_whole_words_and_all_query_terms() {
        let terms = search_terms("email regarding alpha");
        assert!(matches_terms(&terms, "Email regarding alpha's schedule"));
        assert!(!matches_terms(&terms, "email regarding the same schedule"));
        assert!(!matches_terms(&terms, "email from alpha"));
    }
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
pub fn runtime_status() -> runtime::RuntimeStatus {
    runtime::status()
}

/// Download and install a helper runtime (`llama`, `ocr`, or `all`). The
/// command blocks on a worker thread and streams `runtime-progress` events so
/// the UI can show download and extraction progress.
#[tauri::command]
pub async fn install_runtime(
    app: tauri::AppHandle,
    kind: String,
) -> Result<runtime::RuntimeStatus, String> {
    tauri::async_runtime::spawn_blocking(move || runtime::install(&app, &kind))
        .await
        .map_err(|e| format!("The runtime installer stopped unexpectedly: {e}"))?
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
pub async fn open_original(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
    id: String,
) -> Result<(), String> {
    let grants = state.permissions.lock().unwrap().list();
    if let Some(source) = sources::list_all(&grants)
        .into_iter()
        .find(|source| source.id == id)
    {
        if source.location.starts_with("fixture://") {
            return Err("This is a built-in sample source; there is no original file.".into());
        }
        return open_path(&source.location);
    }

    let source = m365::list_graph(&microsoft_state, &grants)
        .await?
        .into_iter()
        .find(|source| source.id == id)
        .ok_or_else(|| "That source is no longer available.".to_string())?;
    open_microsoft_link(&source.location)
}

fn open_microsoft_link(link: &str) -> Result<(), String> {
    let url = Url::parse(link).map_err(|_| "This Microsoft source has no web link.".to_string())?;
    let trusted_hosts = [
        "outlook.office.com",
        "outlook.office365.com",
        "outlook.live.com",
        "www.onenote.com",
        "onenote.com",
        "onedrive.live.com",
    ];
    if url.scheme() != "https" || !trusted_hosts.contains(&url.host_str().unwrap_or_default()) {
        return Err("Microsoft returned an unexpected source link.".into());
    }

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(url.as_str()).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url.as_str()])
        .status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(url.as_str()).status();

    status
        .map_err(|e| format!("Could not open the Microsoft source: {e}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "The Microsoft source could not be opened.".to_string())
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
