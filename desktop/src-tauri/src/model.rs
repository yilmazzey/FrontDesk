use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread::sleep;
use std::time::Duration;

use serde_json::{json, Value};

use crate::contracts::ModelRef;

/// Ollama is preferred so existing local model setups keep working. If it is
/// unavailable, FrontDesk can use its managed llama.cpp runtime instead.
const OLLAMA: &str = "http://127.0.0.1:11434";

struct LlamaServer {
    model: PathBuf,
    base: String,
    child: Child,
}

impl Drop for LlamaServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

static LLAMA: OnceLock<Mutex<Option<LlamaServer>>> = OnceLock::new();

fn llama_slot() -> &'static Mutex<Option<LlamaServer>> {
    LLAMA.get_or_init(|| Mutex::new(None))
}

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

/// Warm a model without asking a question. Ollama imports the GGUF; llama.cpp
/// loads it directly when Ollama is unavailable.
pub fn warm(models_dir: &Path, id: &str) -> Result<String, String> {
    let path = path_for(models_dir, id).ok_or_else(|| format!("Model not found: {id}"))?;
    match ensure_server() {
        Ok(()) => {
            let name = ensure_model(&path)?;
            Ok(format!("{name} is ready (Ollama)"))
        }
        Err(ollama_error) => {
            ensure_llama_fallback();
            if llama_available() {
                ensure_llama(&path)?;
                Ok(format!("{} is ready (llama.cpp)", prettify(id)))
            } else {
                Err(ollama_error)
            }
        }
    }
}

pub fn generate(models_dir: &Path, id: &str, system: &str, user: &str) -> Result<String, String> {
    let path = path_for(models_dir, id).ok_or_else(|| format!("Model not found: {id}"))?;

    match ensure_server() {
        Ok(()) => {
            let name = ensure_model(&path)?;
            generate_ollama(&name, system, user)
        }
        Err(ollama_error) => {
            ensure_llama_fallback();
            if llama_available() {
                let base = ensure_llama(&path)?;
                generate_llama(&base, system, user)
            } else {
                Err(ollama_error)
            }
        }
    }
}

fn generate_ollama(model: &str, system: &str, user: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(3))
        .timeout_read(Duration::from_secs(300))
        .build();

    let body = json!({
        "model": model,
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

fn llama_binary() -> PathBuf {
    if let Some(value) = std::env::var_os("FRONTDESK_LLAMA_SERVER") {
        return PathBuf::from(value);
    }
    // Prefer the copy FrontDesk provisioned itself; PATH is the last resort so
    // a Homebrew/llama.cpp install still works without downloading anything.
    crate::runtime::llama_server().unwrap_or_else(|| PathBuf::from("llama-server"))
}

/// llama.cpp is only provisioned after Ollama cannot start. A failed download
/// leaves the original Ollama error available to the caller.
static LLAMA_FALLBACK_ATTEMPTED: AtomicBool = AtomicBool::new(false);

fn ensure_llama_fallback() {
    if llama_available() {
        return;
    }
    // Only try once per process: a failed download should not make every
    // question retry it. The Access/Settings panel can trigger it explicitly.
    if LLAMA_FALLBACK_ATTEMPTED.swap(true, Ordering::Relaxed) {
        return;
    }
    let _ = crate::runtime::install_quiet("llama");
}

/// True when `llama-server` (or FRONTDESK_LLAMA_SERVER) can be executed.
fn llama_available() -> bool {
    Command::new(llama_binary())
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
}

fn healthy(base: &str) -> bool {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_millis(600))
        .timeout_read(Duration::from_millis(1500))
        .build();
    agent.get(&format!("{base}/health")).call().is_ok()
}

/// Start one llama-server process for the selected GGUF and reuse it until a
/// different model is chosen. The model is loaded lazily so app start stays
/// fast, and the child is killed when it is replaced or the app exits.
fn ensure_llama(path: &Path) -> Result<String, String> {
    let slot = llama_slot();
    let mut guard = slot
        .lock()
        .map_err(|_| "The llama.cpp runtime lock was poisoned.".to_string())?;

    if let Some(server) = guard.as_ref() {
        if server.model == path && healthy(&server.base) {
            return Ok(server.base.clone());
        }
    }
    if let Some(old) = guard.take() {
        drop(old);
    }

    // Ask the OS for a free loopback port. The listener is released before
    // llama-server binds it; the window is small and startup health-checks
    // catch a collision.
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("Could not reserve a port for llama.cpp: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Could not read the reserved port: {e}"))?
        .port();
    drop(listener);

    let mut child = Command::new(llama_binary())
        .arg("--model")
        .arg(path)
        .args(["--host", "127.0.0.1"])
        .arg("--port")
        .arg(port.to_string())
        .args(["--ctx-size", "8192", "--n-gpu-layers", "99", "--no-webui"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("llama-server could not start: {e}"))?;

    let base = format!("http://127.0.0.1:{port}");

    // Loading a 4-bit model can take a while on a laptop; two minutes is a
    // generous ceiling before we report a real failure.
    for _ in 0..240 {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "llama-server stopped while loading the model ({status})."
            ));
        }
        if healthy(&base) {
            *guard = Some(LlamaServer {
                model: path.to_path_buf(),
                base: base.clone(),
                child,
            });
            return Ok(base);
        }
        sleep(Duration::from_millis(500));
    }

    let _ = child.kill();
    let _ = child.wait();
    Err("llama-server did not become ready within two minutes.".into())
}

fn generate_llama(base: &str, system: &str, user: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(3))
        .timeout_read(Duration::from_secs(300))
        .build();

    let body = json!({
        "model": "frontdesk-local",
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "temperature": 0.2,
        "max_tokens": 512,
        "stream": false
    });

    let response = agent
        .post(&format!("{base}/v1/chat/completions"))
        .send_json(body)
        .map_err(|e| format!("llama.cpp request failed: {e}"))?;

    let parsed: Value = response
        .into_json()
        .map_err(|e| format!("Could not parse the llama.cpp response: {e}"))?;

    parsed
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "llama.cpp returned an empty answer.".to_string())
}

// ---- Ollama runtime -------------------------------------------------------

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
        .map_err(|e| {
            format!(
                "No local runtime found. Open Access → Local runtime and install llama-server, \
                 or install Ollama. Then retry. ({e})"
            )
        })?;

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
