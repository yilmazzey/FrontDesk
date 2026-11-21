use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard};

use chrono::{DateTime, Utc};
use futures_util::stream::{self, StreamExt};
use reqwest::Url;
use serde::Serialize;
use tauri::State;

use crate::answer::{self, SemanticCandidate};
use crate::audit::AuditEntry;
use crate::contracts::{
    Answer, AppInfo, ChatTurn, Excerpt, ModelRef, SavedItem, SearchHit, SourceGrant, SourceRef,
};
use crate::index::{IndexHit, IndexStatus};
use crate::microsoft::{self, MicrosoftState};
use crate::model;
use crate::model_download::{self, ModelDownloadState};
use crate::people_store::{PeopleOverrides, PeopleSnapshot, PersonOverride};
use crate::retrieve::chunker;
use crate::runtime;
use crate::sources;
use crate::sources::{m365, web};
use crate::state::AppState;
use walkdir::WalkDir;

fn state_lock<'a, T>(mutex: &'a Mutex<T>) -> Result<MutexGuard<'a, T>, String> {
    mutex
        .lock()
        .map_err(|_| "An application state lock was poisoned. Restart FrontDesk.".to_string())
}

#[tauri::command]
pub fn ping() -> String {
    "pong from the local core".into()
}

#[tauri::command]
pub fn list_grants(state: State<'_, AppState>) -> Result<Vec<SourceGrant>, String> {
    Ok(state_lock(&state.permissions)?.list())
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

    let mut permissions = state_lock(&state.permissions)?;
    let grants = [
        ("mail", "mailbox", "Microsoft Outlook"),
        ("calendar", "calendar", "Microsoft Calendar"),
        ("onenote", "notebooks", "Microsoft OneNote"),
    ]
    .into_iter()
    .map(|(kind, scope, title)| permissions.grant(kind, scope, title))
    .collect::<Vec<_>>();
    for grant in &grants {
        state_lock(&state.audit)?.append(
            "grant",
            Some(grant.id.clone()),
            Some(grant.scope.clone()),
        );
    }
    Ok(permissions.list())
}

#[tauri::command]
pub fn grant_web_search(state: State<'_, AppState>) -> Result<Vec<SourceGrant>, String> {
    let mut permissions = state_lock(&state.permissions)?;
    let grant = permissions.grant("web", "web", "Web search");
    state_lock(&state.audit)?.append("grant", Some(grant.id.clone()), Some(grant.scope.clone()));
    Ok(permissions.list())
}

#[tauri::command]
pub fn disconnect_microsoft(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
) -> Result<Vec<SourceGrant>, String> {
    microsoft::clear_auth(&microsoft_state)?;
    let mut permissions = state_lock(&state.permissions)?;
    let ids = permissions
        .list()
        .into_iter()
        .filter(|grant| matches!(grant.kind.as_str(), "mail" | "calendar" | "onenote"))
        .map(|grant| grant.id)
        .collect::<Vec<_>>();
    for id in ids {
        permissions.revoke(&id);
        state_lock(&state.audit)?.append("revoke", Some(id), None);
    }
    Ok(permissions.list())
}

#[tauri::command]
pub fn revoke_grant(state: State<'_, AppState>, id: String) -> Result<Vec<SourceGrant>, String> {
    let removed = state_lock(&state.permissions)?.revoke(&id);
    if removed {
        state_lock(&state.audit)?.append("revoke", Some(id), None);
    }
    Ok(state_lock(&state.permissions)?.list())
}

#[tauri::command]
pub async fn list_sources(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
) -> Result<Vec<SourceRef>, String> {
    let grants = state_lock(&state.permissions)?.list();
    let include_private_onenote = state_lock(&state.settings)?.get().include_private_onenote;
    let mut all = sources::list_all(&grants);
    // Live connectors must never hide local sources. If Microsoft is offline
    // or the token expired, the local desk keeps working.
    match m365::list_graph(&microsoft_state, &grants, include_private_onenote).await {
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
    let grants = state_lock(&state.permissions)?.list();
    let include_private_onenote = state_lock(&state.settings)?.get().include_private_onenote;
    // Look for a local source first so reading a file never depends on Graph.
    let local = sources::list_all(&grants)
        .into_iter()
        .find(|source| source.id == id);
    let source = match local {
        Some(source) => source,
        None => m365::list_graph(&microsoft_state, &grants, include_private_onenote)
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

    state_lock(&state.audit)?.append(
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
) -> Result<Vec<SearchHit>, String> {
    let query = query.trim();
    if query.is_empty() || query.len() > 200 {
        return Err("Enter a search term under 200 characters.".into());
    }
    let terms = search_terms(query);
    if terms.is_empty() {
        return Ok(Vec::new());
    }

    let grants = state_lock(&state.permissions)?.list();
    let include_private_onenote = state_lock(&state.settings)?.get().include_private_onenote;
    let mut all_sources = sources::list_all(&grants);
    match m365::list_graph(&microsoft_state, &grants, include_private_onenote).await {
        Ok(graph) => all_sources.extend(graph),
        Err(error) => eprintln!("Microsoft search unavailable: {error}"),
    }
    let (graph_sources, local_sources): (Vec<_>, Vec<_>) = all_sources
        .into_iter()
        .partition(|source| matches!(source.kind.as_str(), "mail" | "calendar" | "onenote"));

    let mut matches = Vec::new();
    for source in local_sources {
        let text = sources::read_text(&source)?;
        state_lock(&state.audit)?.append(
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
            matches.push(SearchHit {
                excerpt: matched_excerpt(&text, &terms),
                source,
            });
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
            if let Ok(audit) = audit.lock() {
                audit.append(
                    "read",
                    Some(source.id.clone()),
                    Some(source.location.clone()),
                );
            }
            if matches_terms(
                terms_ref,
                &format!(
                    "{} {} {} {}",
                    source.title, source.location, source.kind, text
                ),
            ) {
                Some(SearchHit {
                    excerpt: matched_excerpt(&text, terms_ref),
                    source,
                })
            } else {
                None
            }
        })
        .buffer_unordered(2)
        .filter_map(|item| async move { item })
        .collect::<Vec<_>>()
        .await;
    matches.extend(graph_matches);
    matches.sort_by(|a, b| b.source.modified.cmp(&a.source.modified));
    state_lock(&state.audit)?.append("search", None, None);
    Ok(matches)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorCheck {
    pub ok: bool,
    pub detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftDiagnostics {
    pub connected: bool,
    pub account: Option<String>,
    pub mail: ConnectorCheck,
    pub calendar: ConnectorCheck,
    pub onenote: ConnectorCheck,
}

#[tauri::command]
pub async fn microsoft_diagnostics(
    microsoft_state: State<'_, MicrosoftState>,
) -> Result<MicrosoftDiagnostics, String> {
    let Some(token) = microsoft::get_access_token(&microsoft_state).await? else {
        return Ok(MicrosoftDiagnostics {
            connected: false,
            account: None,
            mail: ConnectorCheck {
                ok: false,
                detail: "Not connected".into(),
            },
            calendar: ConnectorCheck {
                ok: false,
                detail: "Not connected".into(),
            },
            onenote: ConnectorCheck {
                ok: false,
                detail: "Not connected".into(),
            },
        });
    };

    let account = microsoft::graph_get::<serde_json::Value>(&microsoft_state, &token, "/me", &[])
        .await
        .ok()
        .and_then(|value| {
            value
                .get("mail")
                .or_else(|| value.get("userPrincipalName"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        });

    let mail = match microsoft::graph_get::<serde_json::Value>(
        &microsoft_state,
        &token,
        "/me/mailFolders/inbox/messages",
        &[("$top", "1"), ("$select", "id")],
    )
    .await
    {
        Ok(value) => ConnectorCheck {
            ok: true,
            detail: if value
                .get("value")
                .and_then(|items| items.as_array())
                .is_some_and(|items| !items.is_empty())
            {
                "Inbox reachable".into()
            } else {
                "Inbox reachable but empty".into()
            },
        },
        Err(error) => ConnectorCheck {
            ok: false,
            detail: error,
        },
    };

    let start = (chrono::Utc::now() - chrono::Duration::days(90))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let end = (chrono::Utc::now() + chrono::Duration::days(30))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let calendar = match microsoft::graph_get::<serde_json::Value>(
        &microsoft_state,
        &token,
        "/me/calendar/calendarView",
        &[
            ("startDateTime", start.as_str()),
            ("endDateTime", end.as_str()),
            ("$top", "1"),
            ("$select", "id"),
        ],
    )
    .await
    {
        Ok(value) => ConnectorCheck {
            ok: true,
            detail: if value
                .get("value")
                .and_then(|items| items.as_array())
                .is_some_and(|items| !items.is_empty())
            {
                "Events found".into()
            } else {
                "Calendar reachable but empty in this window".into()
            },
        },
        Err(error) => ConnectorCheck {
            ok: false,
            detail: error,
        },
    };

    let onenote = match microsoft::graph_get::<serde_json::Value>(
        &microsoft_state,
        &token,
        "/me/onenote/pages",
        &[("$top", "1"), ("$select", "id")],
    )
    .await
    {
        Ok(value) => ConnectorCheck {
            ok: true,
            detail: if value
                .get("value")
                .and_then(|items| items.as_array())
                .is_some_and(|items| !items.is_empty())
            {
                "Pages found".into()
            } else {
                "OneNote reachable but no pages found".into()
            },
        },
        Err(error) => ConnectorCheck {
            ok: false,
            detail: error,
        },
    };

    Ok(MicrosoftDiagnostics {
        connected: true,
        account,
        mail,
        calendar,
        onenote,
    })
}

#[tauri::command]
pub fn people_overrides(state: State<'_, AppState>) -> Result<PeopleOverrides, String> {
    Ok(state_lock(&state.people)?.get())
}

#[tauri::command]
pub fn upsert_person(
    state: State<'_, AppState>,
    person: PersonOverride,
) -> Result<PeopleOverrides, String> {
    if person.id.trim().is_empty() {
        return Err("A person id is required.".into());
    }
    Ok(state_lock(&state.people)?.upsert(person))
}

#[tauri::command]
pub fn remove_person(state: State<'_, AppState>, id: String) -> Result<PeopleOverrides, String> {
    Ok(state_lock(&state.people)?.remove(&id))
}

#[tauri::command]
pub fn export_people_graph(
    state: State<'_, AppState>,
    path: String,
    graph: crate::people_graph::PeopleGraph,
) -> Result<(), String> {
    let overrides = state_lock(&state.people)?.get();
    let snapshot = PeopleSnapshot {
        version: 1,
        exported_at: Utc::now().to_rfc3339(),
        graph,
        overrides,
    };
    let text = serde_json::to_string_pretty(&snapshot)
        .map_err(|error| format!("Could not build the graph file: {error}"))?;
    fs::write(&path, text).map_err(|error| format!("Could not save {path}: {error}"))
}

#[tauri::command]
pub fn import_people_graph(
    state: State<'_, AppState>,
    path: String,
) -> Result<PeopleSnapshot, String> {
    let text =
        fs::read_to_string(&path).map_err(|error| format!("Could not read {path}: {error}"))?;
    let mut snapshot: PeopleSnapshot = serde_json::from_str(&text)
        .map_err(|error| format!("That file is not a FrontDesk people graph: {error}"))?;
    if snapshot.version != 1 {
        return Err(format!(
            "This graph was saved by a newer version ({}).",
            snapshot.version
        ));
    }
    state_lock(&state.people)?.replace(snapshot.overrides.clone());
    snapshot.graph.exported_at = Some(snapshot.exported_at.clone());
    Ok(snapshot)
}

#[tauri::command]
pub async fn people_graph(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
) -> Result<crate::people_graph::PeopleGraph, String> {
    crate::people_graph::build(&state, &microsoft_state).await
}

#[tauri::command]
pub async fn manager_snapshot(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
    self_name: Option<String>,
) -> Result<crate::manager::ManagerSnapshot, String> {
    crate::manager::snapshot(&state, &microsoft_state, self_name.as_deref()).await
}

#[tauri::command]
pub async fn ask(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
    question: String,
    history: Option<Vec<ChatTurn>>,
) -> Result<Answer, String> {
    ensure_default_model(&state)?;
    let grants = state_lock(&state.permissions)?.list();
    let settings = state_lock(&state.settings)?.get();
    let mut all_sources = sources::list_all(&grants);
    all_sources.extend(
        m365::list_graph(&microsoft_state, &grants, settings.include_private_onenote)
            .await
            .unwrap_or_else(|error| {
                eprintln!("Microsoft sources unavailable, answering locally: {error}");
                Vec::new()
            }),
    );

    if let Some(index) = state.index.as_ref() {
        let _ = index.upsert_sources(&all_sources);
    }
    let mut has_embeddings = state
        .index
        .as_ref()
        .and_then(|index| index.status().ok())
        .map(|status| status.chunks > 0)
        .unwrap_or(false);

    // Build the metadata/vector candidate index on the first ask. It is a
    // one-time local pass; later questions read only the shortlisted sources.
    if !has_embeddings && state.index.is_some() {
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

    let (mut documents, preferred_chunks) = if has_embeddings || !keyword_hits.is_empty() {
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
            let query_embedding = state.embedder.embed(std::slice::from_ref(&question))?;
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
        let documents = read_documents(&microsoft_state, &selected).await;
        let preferred = preferred_chunks(&documents, &semantic_hits);
        (documents, preferred)
    } else {
        // Before the first index build, keep the complete local + Graph path
        // working. The evidence gate still prevents unrelated answers.
        let documents = read_documents(&microsoft_state, &all_sources).await;
        (documents, Vec::new())
    };

    if settings.answer_mode == "chat" && wants_web(&question) {
        if let Some(grant) = grants.iter().find(|grant| grant.kind == "web") {
            match web::search(&question, grant).await {
                Ok(results) => documents.extend(results),
                Err(error) => eprintln!("Web search unavailable: {error}"),
            }
        }
    }

    let selected_model = settings.selected_model.clone();
    let answer_mode = settings.answer_mode.clone();
    let models_dir = state.models_dir.clone();
    let history = history.unwrap_or_default();
    let result = tauri::async_runtime::spawn_blocking(move || {
        answer::ask_with_documents(
            &question,
            &documents,
            &preferred_chunks,
            selected_model.as_deref(),
            &models_dir,
            &answer_mode,
            &history,
        )
    })
    .await
    .map_err(|error| format!("The answer task stopped: {error}"))?;
    {
        let audit = state_lock(&state.audit)?;
        for source_id in &result.read_sources {
            audit.append("read", Some(source_id.clone()), None);
        }
        for chunk in &result.retrieved {
            audit.append_with_detail(
                "retrieve",
                Some(chunk.source_id.clone()),
                None,
                Some(serde_json::json!({
                    "location": chunk.location,
                    "rank": chunk.rank,
                    "score": (chunk.score * 1000.0).round() / 1000.0,
                    "lexical": chunk.lexical,
                    "semantic": chunk.semantic,
                })),
            );
        }
        let cited: Vec<serde_json::Value> = result
            .provenance
            .cited
            .iter()
            .map(|(source_id, location)| {
                serde_json::json!({ "sourceId": source_id, "location": location })
            })
            .collect();
        let provenance = &result.provenance;
        audit.append_with_detail(
            "answer",
            None,
            None,
            Some(serde_json::json!({
                "summary": format!(
                    "{} · {} cited · {} uncited · {} verification",
                    provenance.basis,
                    provenance.cited.len(),
                    provenance.uncited_claims,
                    provenance.verification
                ),
                "basis": provenance.basis,
                "model": provenance.model,
                "cited": cited,
                "uncitedClaims": provenance.uncited_claims,
                "verification": provenance.verification,
                "abstained": provenance.abstained,
            })),
        );
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

fn preferred_chunks(
    documents: &[(SourceRef, String)],
    hits: &[IndexHit],
) -> Vec<SemanticCandidate> {
    // Build chunks once per source, then walk the hits in their global
    // similarity order. Grouping by document first would scramble the vector
    // rank that hybrid fusion depends on.
    let chunks_by_source: std::collections::HashMap<&str, Vec<crate::retrieve::chunker::Chunk>> =
        documents
            .iter()
            .map(|(source, text)| (source.id.as_str(), chunker::chunk_source(source, text)))
            .collect();

    let mut preferred: Vec<SemanticCandidate> = Vec::new();
    for hit in hits {
        let Some(chunks) = chunks_by_source.get(hit.source_id.as_str()) else {
            continue;
        };
        let Some(chunk) = chunks.get(hit.chunk_index) else {
            continue;
        };
        if preferred.iter().any(|existing| {
            existing.chunk.source_id == chunk.source_id && existing.chunk.location == chunk.location
        }) {
            continue;
        }
        preferred.push(SemanticCandidate {
            chunk: chunk.clone(),
            score: hit.score,
        });
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
    let grants = state_lock(&state.permissions)?.list();
    let include_private_onenote = state_lock(&state.settings)?.get().include_private_onenote;
    let mut all_sources = sources::list_all(&grants);
    all_sources.extend(
        m365::list_graph(&microsoft_state, &grants, include_private_onenote)
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
    state: State<'_, AppState>,
    folder: String,
    classification: String,
    title: String,
    body: String,
    sources: Vec<String>,
) -> Result<String, String> {
    let path = write_saved_answer(&folder, &classification, &title, &body, &sources)?;
    state_lock(&state.settings)?.set_saved_folder(&folder);
    Ok(path)
}

pub(crate) fn write_saved_answer(
    folder: &str,
    classification: &str,
    title: &str,
    body: &str,
    sources: &[String],
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
pub fn set_saved_folder(state: State<'_, AppState>, folder: String) -> Result<String, String> {
    let root = PathBuf::from(folder.trim());
    if !root.is_dir() {
        return Err("Choose an existing folder for saved answers.".into());
    }
    let root = fs::canonicalize(&root).unwrap_or(root);
    let path = root.to_string_lossy().to_string();
    state_lock(&state.settings)?.set_saved_folder(&path);
    Ok(path)
}

#[tauri::command]
pub fn list_saved(state: State<'_, AppState>) -> Result<Vec<SavedItem>, String> {
    let folder = state_lock(&state.settings)?.get().saved_folder;
    let Some(folder) = folder else {
        return Ok(Vec::new());
    };
    let root = PathBuf::from(folder);
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    Ok(scan_saved(&root))
}

fn scan_saved(root: &Path) -> Vec<SavedItem> {
    let mut items = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .take(600)
    {
        if !entry.file_type().is_file()
            || entry.path().extension().and_then(|ext| ext.to_str()) != Some("md")
        {
            continue;
        }
        if let Some(item) = parse_saved(entry.path()) {
            items.push(item);
        }
    }
    items.sort_by(|left, right| right.saved_at.cmp(&left.saved_at));
    items
}

fn parse_saved(path: &Path) -> Option<SavedItem> {
    let raw = fs::read_to_string(path).ok()?;
    let rest = raw.strip_prefix("---\n")?;
    let end = rest.find("\n---\n")?;
    let front = &rest[..end];
    let body_block = rest[end + 5..].trim_start();

    let mut classification = "reference".to_string();
    let mut saved_at = String::new();
    let mut sources = Vec::new();
    let mut in_sources = false;

    for line in front.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("classification:") {
            let value = value.trim().to_lowercase();
            if matches!(
                value.as_str(),
                "briefing" | "roadmap" | "todo" | "decision" | "reference"
            ) {
                classification = value;
            }
            in_sources = false;
        } else if let Some(value) = trimmed.strip_prefix("savedAt:") {
            saved_at = value.trim().to_string();
            in_sources = false;
        } else if trimmed == "sources:" {
            in_sources = true;
        } else if in_sources {
            if let Some(value) = trimmed.strip_prefix('-') {
                let value = value.trim().trim_matches('"').trim();
                if !value.is_empty() {
                    sources.push(value.to_string());
                }
            } else if !trimmed.is_empty() {
                in_sources = false;
            }
        }
    }

    if saved_at.is_empty() {
        let modified = fs::metadata(path).ok()?.modified().ok()?;
        saved_at = DateTime::<Utc>::from(modified).to_rfc3339();
    }

    let (title, body) = if let Some(title) = body_block.strip_prefix("# ") {
        let (title, body) = title.split_once('\n').unwrap_or((title, ""));
        (title.trim().to_string(), body.trim().to_string())
    } else {
        let title = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Saved answer")
            .to_string();
        (title, body_block.trim().to_string())
    };

    let path_string = path.to_string_lossy().to_string();
    Some(SavedItem {
        id: path_string.clone(),
        path: path_string,
        title,
        classification,
        saved_at,
        body,
        sources,
    })
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let candidate = PathBuf::from(&path);
    if !candidate.exists() {
        return Err("That path is no longer available.".into());
    }
    #[cfg(target_os = "macos")]
    let status = Command::new("open").args(["-R", &path]).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .arg(format!("/select,{path}"))
        .status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(candidate.parent().unwrap_or(&candidate))
        .status();

    status
        .map_err(|error| format!("Could not reveal that path: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "The path could not be revealed.".to_string())
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

fn matched_excerpt(text: &str, terms: &[String]) -> String {
    if text.trim().is_empty() {
        return String::new();
    }
    let lower = text.to_lowercase();
    let offset = terms
        .iter()
        .filter_map(|term| lower.find(term))
        .min()
        .unwrap_or(0);
    let start = floor_boundary(text, offset.saturating_sub(120));
    let end = ceil_boundary(text, (offset + 300).min(text.len()));
    let mut excerpt = text[start..end]
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if start > 0 {
        excerpt.insert(0, '…');
    }
    if end < text.len() {
        excerpt.push('…');
    }
    excerpt
}

fn floor_boundary(text: &str, mut index: usize) -> usize {
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_boundary(text: &str, mut index: usize) -> usize {
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn wants_web(question: &str) -> bool {
    let lower = question.to_lowercase();
    [
        "web",
        "online",
        "internet",
        "latest",
        "news",
        "weather",
        "headline",
        "current events",
        "look up",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
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
    use super::{
        matched_excerpt, matches_terms, parse_saved, preferred_chunks, search_terms,
        write_saved_answer,
    };
    use crate::contracts::SourceRef;
    use crate::index::IndexHit;

    #[test]
    fn content_search_matches_whole_words_and_all_query_terms() {
        let terms = search_terms("email regarding alpha");
        assert!(matches_terms(&terms, "Email regarding alpha's schedule"));
        assert!(!matches_terms(&terms, "email regarding the same schedule"));
        assert!(!matches_terms(&terms, "email from alpha"));
    }

    #[test]
    fn search_excerpt_centres_the_matched_terms() {
        let text = "The weekly review covered pricing, hiring and the launch plan. We agreed to send the revised scope by Friday and wait for legal before publishing.";
        let excerpt = matched_excerpt(text, &["scope".into()]);
        assert!(excerpt.contains("revised scope"));
    }

    #[test]
    fn preferred_chunks_carry_semantic_scores_for_fusion() {
        let source = SourceRef {
            id: "file:1".into(),
            grant_id: "grant".into(),
            kind: "file".into(),
            title: "Note".into(),
            location: "/tmp/note.md".into(),
            modified: "2026-11-14T00:00:00Z".into(),
            hash: "v1".into(),
            people: Vec::new(),
        };
        let hits = vec![IndexHit {
            source_id: "file:1".into(),
            chunk_index: 0,
            score: 0.83,
        }];

        let preferred = preferred_chunks(
            &[(source, "Waiting on Priya for the budget sign-off.".into())],
            &hits,
        );

        assert_eq!(preferred.len(), 1);
        assert_eq!(preferred[0].score, 0.83);
        assert_eq!(preferred[0].chunk.source_id, "file:1");
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
        let path = write_saved_answer(
            &folder.to_string_lossy(),
            "briefing",
            "Weekly pricing brief",
            "We decided usage-based pricing.",
            &["Pricing sync".into()],
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
        let item = parse_saved(saved).expect("saved Markdown should rehydrate");
        assert_eq!(item.title, "Weekly pricing brief");
        assert_eq!(item.classification, "briefing");
        assert_eq!(item.sources, vec!["Pricing sync"]);
        assert!(item.body.contains("usage-based pricing"));
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
    state_lock(&state.settings)?.select_model(selected);
    app_info(state)
}

fn ensure_default_model(state: &AppState) -> Result<(), String> {
    let mut store = state_lock(&state.settings)?;
    let settings = store.get();
    if let Some(selected) = settings.selected_model.as_deref() {
        if model::path_for(&state.models_dir, selected).is_some() {
            return Ok(());
        }
        // The selected GGUF was moved or deleted. Forgetting it is better than
        // showing a model that cannot be loaded (and failing later in Ask or
        // meeting notes).
        let replacement = model::list(&state.models_dir)
            .first()
            .map(|item| item.id.clone());
        store.auto_select_model(replacement);
        return Ok(());
    }
    if settings.model_choice_explicit {
        return Ok(());
    }
    let first = model::list(&state.models_dir)
        .first()
        .map(|item| item.id.clone());
    if first.is_some() {
        store.auto_select_model(first);
    }
    Ok(())
}

#[tauri::command]
pub fn set_keep_microsoft_signed_in(
    state: State<'_, AppState>,
    microsoft_state: State<'_, MicrosoftState>,
    enabled: bool,
) -> Result<AppInfo, String> {
    state_lock(&state.settings)?.set_keep_microsoft_signed_in(enabled);
    crate::microsoft::set_keep_signed_in(enabled);
    if enabled {
        crate::microsoft::persist_current_session(&microsoft_state);
    }
    app_info(state)
}

#[tauri::command]
pub fn set_microsoft_tenant(
    state: State<'_, AppState>,
    tenant: Option<String>,
) -> Result<AppInfo, String> {
    state_lock(&state.settings)?.set_microsoft_tenant(tenant.as_deref());
    app_info(state)
}

#[tauri::command]
pub fn set_include_private_onenote(
    state: State<'_, AppState>,
    include: bool,
) -> Result<AppInfo, String> {
    state_lock(&state.settings)?.set_include_private_onenote(include);
    app_info(state)
}

#[tauri::command]
pub fn select_mode(state: State<'_, AppState>, mode: String) -> Result<AppInfo, String> {
    state_lock(&state.settings)?.set_mode(&mode);
    app_info(state)
}

#[tauri::command]
pub fn set_microsoft_client_id(
    state: State<'_, AppState>,
    client_id: Option<String>,
) -> Result<AppInfo, String> {
    state
        .settings
        .lock()
        .unwrap()
        .set_microsoft_client_id(client_id.as_deref());
    app_info(state)
}

#[tauri::command]
pub fn warm_model(state: State<'_, AppState>, id: String) -> Result<String, String> {
    model::warm(&state.models_dir, &id)
}

#[tauri::command]
pub fn app_info(state: State<'_, AppState>) -> Result<AppInfo, String> {
    ensure_default_model(&state)?;
    let settings = state_lock(&state.settings)?.get();
    Ok(AppInfo {
        data_dir: state.data_dir.to_string_lossy().to_string(),
        models_dir: state.models_dir.to_string_lossy().to_string(),
        selected_model: settings.selected_model,
        answer_mode: settings.answer_mode,
        saved_folder: settings.saved_folder,
        microsoft_client_id: settings.microsoft_client_id,
        microsoft_tenant: settings.microsoft_tenant,
        keep_microsoft_signed_in: settings.keep_microsoft_signed_in,
        include_private_onenote: settings.include_private_onenote,
    })
}

#[tauri::command]
pub fn runtime_status() -> runtime::RuntimeStatus {
    runtime::status()
}

#[tauri::command]
pub async fn download_model(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    download: State<'_, ModelDownloadState>,
) -> Result<String, String> {
    let models_dir = state.models_dir.clone();
    let download_state = download.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        model_download::download(&app, &models_dir, &download_state)
    })
    .await
    .map_err(|error| format!("The model download task stopped: {error}"))?
}

#[tauri::command]
pub fn cancel_model_download(download: State<'_, ModelDownloadState>) {
    download.cancel();
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
    Ok(state_lock(&state.audit)?.list(limit.unwrap_or(50)))
}

#[tauri::command]
pub fn clear_audit(state: State<'_, AppState>) -> Result<(), String> {
    let audit = state_lock(&state.audit)?;
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
    let grants = state_lock(&state.permissions)?.list();
    let include_private_onenote = state_lock(&state.settings)?.get().include_private_onenote;
    if let Some(source) = sources::list_all(&grants)
        .into_iter()
        .find(|source| source.id == id)
    {
        if source.location.starts_with("fixture://") {
            return Err("This is a built-in sample source; there is no original file.".into());
        }
        return open_path(&source.location);
    }

    let source = m365::list_graph(&microsoft_state, &grants, include_private_onenote)
        .await?
        .into_iter()
        .find(|source| source.id == id)
        .ok_or_else(|| "That source is no longer available.".to_string())?;
    open_microsoft_link(&source.location)
}

#[tauri::command]
pub fn open_ask(app: tauri::AppHandle, question: Option<String>) -> Result<(), String> {
    crate::tray::open_main_ask(&app, question);
    Ok(())
}

#[tauri::command]
pub fn hide_tray_popover(app: tauri::AppHandle) {
    crate::tray::hide_popover(&app);
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "That web link is invalid.".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Only web links can be opened.".to_string());
    }
    open_external_url(parsed.as_str())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "That sign-in link is invalid.".to_string())?;
    let host = parsed.host_str().unwrap_or_default();
    let trusted = host == "microsoft.com"
        || host.ends_with(".microsoft.com")
        || host == "login.live.com"
        || host.ends_with(".microsoftonline.com")
        || host.ends_with(".live.com")
        || host == "outlook.office.com"
        || host.ends_with(".outlook.office.com")
        || host == "outlook.office365.com"
        || host.ends_with(".outlook.office365.com")
        || host.ends_with(".sharepoint.com");
    if parsed.scheme() != "https" || !trusted {
        return Err("Refusing to open an unexpected sign-in link.".into());
    }
    open_external_url(parsed.as_str())
}

fn open_external_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(url).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(url).status();

    status
        .map_err(|error| format!("Could not open the sign-in page: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "The sign-in page could not be opened.".to_string())
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
