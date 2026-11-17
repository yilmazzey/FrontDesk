use std::fs;
use std::path::PathBuf;
use std::process::Command;

use futures_util::stream::{self, StreamExt};
use reqwest::Url;
use tauri::{Emitter, State};

use crate::answer;
use crate::audit::AuditEntry;
use crate::contracts::{Answer, AppInfo, Excerpt, ModelRef, SourceGrant, SourceRef};
use crate::index::{IndexHit, IndexStatus};
use crate::microsoft::{self, MicrosoftState};
use crate::model;
use crate::retrieve::chunker::{self, Chunk};
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
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
    question: String,
) -> Result<Answer, String> {
    let stage = |name: &str| {
        let _ = app.emit("ask-stage", serde_json::json!({ "stage": name }));
    };
    stage("ingest");
    let grants = state.permissions.lock().unwrap().list();
    let settings = state.settings.lock().unwrap().get();
    let mut all_sources = sources::list_all(&grants);
    all_sources.extend(
        m365::list_graph(&microsoft_state, &grants)
            .await
            .unwrap_or_else(|error| {
                eprintln!("Microsoft sources unavailable, answering locally: {error}");
                Vec::new()
            }),
    );

    if let Some(index) = state.index.as_ref() {
        let _ = index.upsert_sources(&all_sources);
    }
    stage("extract");

    let mut has_embeddings = state
        .index
        .as_ref()
        .and_then(|index| index.status().ok())
        .map(|status| status.chunks > 0)
        .unwrap_or(false);

    // Build the metadata/vector candidate index on the first ask. It is a
    // one-time local pass; later questions read only the shortlisted sources.
    if !has_embeddings && state.index.is_some() {
        stage("extract");
        if let Err(error) = index_sources(&state, &microsoft_state, &all_sources).await {
            eprintln!("Could not build the semantic index: {error}");
        }
        has_embeddings = state
            .index
            .as_ref()
            .and_then(|index| index.status().ok())
            .map(|status| status.chunks > 0)
            .unwrap_or(false);
    }

    let keyword_hits = state
        .index
        .as_ref()
        .and_then(|index| index.search_keywords(&question, 12).ok())
        .unwrap_or_default();

    let (documents, preferred_chunks) = if has_embeddings || !keyword_hits.is_empty() {
        let index = state
            .index
            .as_ref()
            .expect("index was just checked for candidate selection");
        let mut selected: Vec<SourceRef> = Vec::new();

        for hit in &keyword_hits {
            if let Some(source) = all_sources.iter().find(|source| source.id == hit.source_id) {
                if !selected.iter().any(|existing| existing.id == source.id) {
                    selected.push(source.clone());
                }
            }
        }

        let semantic_hits = if has_embeddings {
            let query_embedding = state.embedder.embed(&[question.clone()])?;
            index.search_embeddings(&query_embedding[0], 24)?
        } else {
            Vec::new()
        };

        for hit in &semantic_hits {
            if selected.len() >= 12 {
                break;
            }
            if let Some(source) = all_sources.iter().find(|source| source.id == hit.source_id) {
                if !selected.iter().any(|existing| existing.id == source.id) {
                    selected.push(source.clone());
                }
            }
        }

        selected.truncate(12);
        stage("link");
        let documents = read_documents(&microsoft_state, &selected).await;
        let preferred = preferred_chunks(&documents, &semantic_hits);
        (documents, preferred)
    } else {
        // Before the first index build, keep the complete local + Graph path
        // working. The evidence gate still prevents unrelated answers.
        let documents = read_documents(&microsoft_state, &all_sources).await;
        (documents, Vec::new())
    };

    stage("plan");
    let result = answer::ask_with_documents(
        &question,
        &documents,
        &preferred_chunks,
        settings.selected_model.as_deref(),
        &state.models_dir,
        &settings.answer_mode,
    );
    stage("brief");

    {
        let audit = state.audit.lock().unwrap();
        for source_id in &result.read_sources {
            audit.append("read", Some(source_id.clone()), None);
        }
        audit.append("ask", None, None);
    }

    Ok(result.answer)
}

async fn read_documents(
    microsoft_state: &MicrosoftState,
    source_refs: &[SourceRef],
) -> Vec<(SourceRef, String)> {
    let mut documents = Vec::new();
    for source in source_refs {
        let text = if matches!(source.kind.as_str(), "mail" | "calendar" | "onenote") {
            match m365::read_graph_source(microsoft_state, source).await {
                Ok(text) => text,
                Err(error) => {
                    eprintln!("Skipping Microsoft source {}: {error}", source.id);
                    continue;
                }
            }
        } else {
            match sources::read_text(source) {
                Ok(text) => text,
                Err(error) => {
                    eprintln!("Skipping source {}: {error}", source.id);
                    continue;
                }
            }
        };

        let body = match source.kind.as_str() {
            "mail" => format!(
                "Email: {}\nReceived: {}\n\n{text}",
                source.title, source.modified
            ),
            "calendar" => format!(
                "Calendar event: {}\nStarts: {}\n\n{text}",
                source.title, source.modified
            ),
            "onenote" => format!(
                "OneNote page: {}\nModified: {}\n\n{text}",
                source.title, source.modified
            ),
            _ => text,
        };
        documents.push((source.clone(), body));
    }
    documents
}

fn preferred_chunks(documents: &[(SourceRef, String)], hits: &[IndexHit]) -> Vec<Chunk> {
    let mut preferred: Vec<Chunk> = Vec::new();
    for (source, text) in documents {
        let chunks = chunker::chunk_source(source, text);
        for hit in hits.iter().filter(|hit| hit.source_id == source.id) {
            let Some(chunk) = chunks.get(hit.chunk_index) else {
                continue;
            };
            if preferred.iter().any(|existing| {
                existing.source_id == chunk.source_id && existing.location == chunk.location
            }) {
                continue;
            }
            preferred.push(chunk.clone());
        }
    }
    preferred
}

#[tauri::command]
pub fn index_status(state: State<'_, AppState>) -> Result<IndexStatus, String> {
    state
        .index
        .as_ref()
        .ok_or_else(|| "The metadata index is unavailable.".to_string())?
        .status()
}

#[tauri::command]
pub async fn build_index(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
) -> Result<IndexStatus, String> {
    let grants = state.permissions.lock().unwrap().list();
    let mut all_sources = sources::list_all(&grants);
    all_sources.extend(
        m365::list_graph(&microsoft_state, &grants)
            .await
            .unwrap_or_else(|error| {
                eprintln!("Microsoft sources unavailable while indexing: {error}");
                Vec::new()
            }),
    );

    index_sources(&state, &microsoft_state, &all_sources).await?;
    state
        .index
        .as_ref()
        .ok_or_else(|| "The metadata index is unavailable.".to_string())?
        .status()
}

async fn index_sources(
    state: &AppState,
    microsoft_state: &MicrosoftState,
    all_sources: &[SourceRef],
) -> Result<(), String> {
    let index = state
        .index
        .as_ref()
        .ok_or_else(|| "The metadata index is unavailable.".to_string())?;
    index.upsert_sources(all_sources)?;

    for source in all_sources {
        if !index.needs_index(source)? {
            continue;
        }
        let documents = read_documents(microsoft_state, std::slice::from_ref(source)).await;
        let Some((_, text)) = documents.into_iter().next() else {
            continue;
        };
        let chunks = chunker::chunk_source(source, &text);
        if chunks.is_empty() {
            continue;
        }
        let texts = chunks
            .iter()
            .map(|chunk| chunk.text.clone())
            .collect::<Vec<_>>();
        let embeddings = state.embedder.embed(&texts)?;
        index.replace_chunks(source, &chunks, &embeddings)?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_answer(
    folder: String,
    classification: String,
    title: String,
    body: String,
    sources: Vec<String>,
) -> Result<String, String> {
    let root = PathBuf::from(folder.trim());
    if !root.is_dir() {
        return Err("Choose an existing folder before saving.".into());
    }
    let root = fs::canonicalize(&root).unwrap_or(root);
    let (key, label) = match classification.to_lowercase().as_str() {
        "briefing" => ("briefing", "Briefing"),
        "roadmap" => ("roadmap", "Roadmap"),
        "todo" => ("todo", "Todo"),
        "decision" => ("decision", "Decision"),
        _ => ("reference", "Reference"),
    };
    let directory = root.join(label);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create {}: {error}", directory.display()))?;

    let mut slug: String = title
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() {
        "frontdesk-answer"
    } else {
        &slug[..slug.len().min(60)]
    };
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let filename = format!("{slug}-{stamp}.md");
    let path = directory.join(filename);

    let mut markdown = format!(
        "---
classification: {key}
savedAt: {}
",
        chrono::Utc::now().to_rfc3339()
    );
    if !sources.is_empty() {
        markdown.push_str(
            "sources:
",
        );
        for source in sources {
            markdown.push_str(&format!(
                "  - {}
",
                source.replace('\n', " ")
            ));
        }
    }
    markdown.push_str(
        "---

",
    );
    markdown.push_str(&format!(
        "# {title}

{body}
"
    ));

    fs::write(&path, markdown).map_err(|error| format!("Could not save the answer: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_saved(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("That saved file is no longer available.".into());
    }
    open_path(&path.to_string_lossy())
}

#[tauri::command]
pub fn clear_index(state: State<'_, AppState>) -> Result<IndexStatus, String> {
    let index = state
        .index
        .as_ref()
        .ok_or_else(|| "The metadata index is unavailable.".to_string())?;
    index.clear()?;
    index.status()
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
    use super::{matches_terms, save_answer, search_terms};

    #[test]
    fn content_search_matches_whole_words_and_all_query_terms() {
        let terms = search_terms("email regarding alpha");
        assert!(matches_terms(&terms, "Email regarding alpha's schedule"));
        assert!(!matches_terms(&terms, "email regarding the same schedule"));
        assert!(!matches_terms(&terms, "email from alpha"));
    }

    #[test]
    fn save_answer_writes_one_markdown_file_in_the_chosen_folder() {
        let folder = std::env::temp_dir().join(format!(
            "frontdesk-save-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&folder).unwrap();
        let path = save_answer(
            folder.to_string_lossy().to_string(),
            "briefing".into(),
            "Weekly pricing brief".into(),
            "We decided usage-based pricing.".into(),
            vec!["Pricing sync".into()],
        )
        .unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("classification: briefing"));
        assert!(text.contains("We decided usage-based pricing."));
        assert!(text.contains("Pricing sync"));
        let saved = std::path::Path::new(&path);
        assert_eq!(
            saved
                .parent()
                .and_then(|parent| parent.file_name())
                .and_then(|name| name.to_str()),
            Some("Briefing")
        );
        let _ = std::fs::remove_dir_all(&folder);
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
