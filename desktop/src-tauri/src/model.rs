use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::Duration;

use serde_json::{json, Value};

use crate::contracts::ModelRef;
use crate::retrieve::chunker::Chunk;

const OLLAMA: &str = "http://127.0.0.1:11434";

/// Every model is a GGUF file the user drops into the models folder. Adding or
/// removing a file is the entire "plug a model in/out" workflow.
pub fn list(models_dir: &Path) -> Vec<ModelRef> {
    let mut models = Vec::new();
    let Ok(entries) = fs::read_dir(models_dir) else {
        return models;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let is_gguf = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("gguf"))
            .unwrap_or(false);
        if !path.is_file() || !is_gguf {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let stem = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or(file_name);

        models.push(ModelRef {
            id: file_name.to_string(),
            name: prettify(stem),
            path: path.to_string_lossy().to_string(),
            size_bytes: entry.metadata().map(|m| m.len()).unwrap_or(0),
            kind: "gguf".into(),
            status: "ready".into(),
        });
    }

    models.sort_by(|a, b| a.name.cmp(&b.name));
    models
}

pub fn path_for(models_dir: &Path, id: &str) -> Option<PathBuf> {
    let path = models_dir.join(id);
    if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("gguf") {
        Some(path)
    } else {
        None
    }
}

/// Import (if needed) and warm a model without asking a question.
pub fn warm(models_dir: &Path, id: &str) -> Result<String, String> {
    let path = path_for(models_dir, id).ok_or_else(|| format!("Model not found: {id}"))?;
    ensure_server()?;
    let name = ensure_model(&path)?;
    Ok(format!("{name} is ready"))
}

pub fn generate(models_dir: &Path, id: &str, system: &str, user: &str) -> Result<String, String> {
    let path = path_for(models_dir, id).ok_or_else(|| format!("Model not found: {id}"))?;
    ensure_server()?;
    let name = ensure_model(&path)?;

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(3))
        .timeout_read(Duration::from_secs(300))
        .build();

    let body = json!({
        "model": name,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "stream": false,
        "options": { "temperature": 0.1, "num_ctx": 8192 }
    });

    let response = agent
        .post(&format!("{OLLAMA}/api/chat"))
        .send_json(body)
        .map_err(|e| format!("Local model request failed: {e}"))?;

    let parsed: Value = response
        .into_json()
        .map_err(|e| format!("Could not parse model response: {e}"))?;

    parsed
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "The model returned an empty answer.".to_string())
}

fn prettify(stem: &str) -> String {
    stem.replace(['_', '-', '.'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn sanitize(stem: &str) -> String {
    let mut name: String = stem
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    while name.contains("--") {
        name = name.replace("--", "-");
    }
    let name = name.trim_matches('-');
    format!("frontdesk-{}", &name[..name.len().min(48)])
}

fn tags() -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(1))
        .timeout_read(Duration::from_secs(2))
        .build();
    agent
        .get(&format!("{OLLAMA}/api/tags"))
        .call()
        .map_err(|e| e.to_string())?
        .into_json()
        .map_err(|e| e.to_string())
}

fn ensure_server() -> Result<(), String> {
    if tags().is_ok() {
        return Ok(());
    }

    Command::new("ollama")
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Ollama is not installed or not on PATH: {e}"))?;

    for _ in 0..30 {
        sleep(Duration::from_millis(500));
        if tags().is_ok() {
            return Ok(());
        }
    }

    Err("Ollama did not start. Run `ollama serve` in a terminal and retry.".into())
}

fn ensure_model(path: &Path) -> Result<String, String> {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("model");
    let name = sanitize(stem);

    if let Ok(json) = tags() {
        let present = json
            .get("models")
            .and_then(Value::as_array)
            .map(|models| {
                models.iter().any(|m| {
                    m.get("name")
                        .and_then(Value::as_str)
                        .map(|n| n.starts_with(&name))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        if present {
            return Ok(name);
        }
    }

    let modelfile = std::env::temp_dir().join(format!("{name}.Modelfile"));
    let from = path.to_string_lossy().replace('"', "\\\"");
    fs::write(&modelfile, format!("FROM \"{from}\"\n"))
        .map_err(|e| format!("Could not write Modelfile: {e}"))?;

    let output = Command::new("ollama")
        .args(["create", &name, "-f"])
        .arg(&modelfile)
        .output()
        .map_err(|e| format!("Could not import the GGUF model: {e}"))?;

    let _ = fs::remove_file(&modelfile);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Ollama could not import the model: {}",
            format!("{stdout} {stderr}").trim()
        ));
    }

    Ok(name)
}

/// Reserved for the next adapter: llama.cpp's OpenAI-compatible server. The
/// UI and pipeline only depend on `generate`, so a new runtime is a new
/// function here, not a rewrite.
#[allow(dead_code)]
pub fn ollama_base() -> &'static str {
    OLLAMA
}

#[allow(dead_code)]
pub fn excerpt_count(_chunks: &[Chunk]) -> usize {
    _chunks.len()
}
