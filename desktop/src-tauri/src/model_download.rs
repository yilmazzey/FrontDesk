use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::runtime::RuntimeProgress;

pub const MODEL_FILE: &str = "microsoft_Phi-4-mini-instruct-Q4_K_M.gguf";
pub const MODEL_SIZE: u64 = 2_491_874_688;
const MODEL_URL: &str = "https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf";
const MODEL_SHA256: &str = "01999f17c39cc3074afae5e9c539bc82d45f2dd7faa3917c66cbef76fce8c0c2";

#[derive(Clone, Default)]
pub struct ModelDownloadState {
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

impl ModelDownloadState {
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    fn reset(&self) {
        self.cancel.store(false, Ordering::SeqCst);
    }

    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}

fn emit(app: &AppHandle, phase: &str, message: &str, downloaded: u64, total: u64) {
    let _ = app.emit(
        "runtime-progress",
        RuntimeProgress {
            kind: "model".into(),
            phase: phase.into(),
            message: message.into(),
            downloaded,
            total,
        },
    );
}

pub fn download(
    app: &AppHandle,
    models_dir: &Path,
    state: &ModelDownloadState,
) -> Result<String, String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("A model download is already running.".into());
    }
    struct RunningGuard<'a>(&'a AtomicBool);
    impl Drop for RunningGuard<'_> {
        fn drop(&mut self) {
            self.0.store(false, Ordering::SeqCst);
        }
    }
    let _guard = RunningGuard(&state.running);
    state.reset();
    fs::create_dir_all(models_dir)
        .map_err(|error| format!("Could not create the models folder: {error}"))?;
    let final_path = models_dir.join(MODEL_FILE);
    if final_path.is_file() {
        let existing = sha256(&final_path)?;
        if existing.eq_ignore_ascii_case(MODEL_SHA256) {
            emit(
                app,
                "done",
                "Phi-4 Mini is already installed.",
                MODEL_SIZE,
                MODEL_SIZE,
            );
            return Ok(final_path.to_string_lossy().to_string());
        }
        fs::remove_file(&final_path)
            .map_err(|error| format!("Could not replace an invalid model file: {error}"))?;
    }

    let part = models_dir.join(format!("{MODEL_FILE}.part"));
    let existing = fs::metadata(&part).map(|meta| meta.len()).unwrap_or(0);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(7200))
        .build()
        .map_err(|error| format!("Could not prepare the model download: {error}"))?;
    let mut request = client.get(MODEL_URL);
    if existing > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={existing}-"));
    }
    let response = request
        .send()
        .map_err(|error| format!("Could not download the model: {error}"))?;
    let resumable = existing > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let mut file = if resumable {
        OpenOptions::new()
            .append(true)
            .open(&part)
            .map_err(|error| format!("Could not resume the model download: {error}"))?
    } else {
        File::create(&part)
            .map_err(|error| format!("Could not start the model download: {error}"))?
    };
    let start = if resumable { existing } else { 0 };
    let remaining = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let total = if remaining > 0 {
        start + remaining
    } else {
        MODEL_SIZE
    };

    emit(
        app,
        "download",
        if resumable {
            "Resuming Phi-4 Mini…"
        } else {
            "Downloading Phi-4 Mini (Q4_K_M)…"
        },
        start,
        total,
    );

    let mut reader = response;
    let mut buffer = vec![0u8; 256 * 1024];
    let mut downloaded = start;
    let mut last_reported = start;
    loop {
        if state.cancelled() {
            let _ = file.flush();
            return Err("Model download cancelled. Press Download again to resume.".into());
        }
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Model download interrupted: {error}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| format!("Could not write the model: {error}"))?;
        downloaded += read as u64;
        if downloaded - last_reported >= 2 * 1024 * 1024 || downloaded == total {
            last_reported = downloaded;
            let pct = downloaded
                .checked_mul(100)
                .and_then(|value| value.checked_div(total))
                .map(|value| format!("{value}%"))
                .unwrap_or_default();
            emit(
                app,
                "download",
                &format!("Downloading Phi-4 Mini… {pct}"),
                downloaded,
                total,
            );
        }
    }
    file.flush()
        .map_err(|error| format!("Could not save the model: {error}"))?;
    drop(file);

    emit(app, "verify", "Verifying the model checksum…", total, total);
    let actual = sha256(&part)?;
    if !actual.eq_ignore_ascii_case(MODEL_SHA256) {
        let _ = fs::remove_file(&part);
        return Err(
            "The downloaded model failed SHA-256 verification and was removed. Try again.".into(),
        );
    }
    if final_path.exists() {
        let _ = fs::remove_file(&final_path);
    }
    fs::rename(&part, &final_path)
        .map_err(|error| format!("Could not finish installing the model: {error}"))?;

    emit(app, "done", "Phi-4 Mini is installed.", total, total);
    Ok(final_path.to_string_lossy().to_string())
}

fn sha256(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|error| format!("Could not read the model: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read the model: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
