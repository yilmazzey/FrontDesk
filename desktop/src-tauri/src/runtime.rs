//! Self-provisioning for the optional native helpers.
//!
//! FrontDesk prefers llama.cpp's `llama-server` over Ollama. Historically that
//! meant asking the user to `brew install llama.cpp` and hope `llama-server`
//! landed on `PATH`. This module removes that step: on request it downloads the
//! pinned llama.cpp release into the app-data folder, extracts it, marks the
//! binary executable and remembers the path. OCR helpers (Tesseract and
//! Poppler) use the platform package manager where that is safe, and report a
//! copy-pasteable command everywhere else.
//!
//! Nothing here is bundled into the installer. The base app stays tiny; the
//! helpers arrive on first use and live under
//! `<app-data>/runtimes/`.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Pinned llama.cpp build. The v1.0.0 tag carries no binary assets, so the
/// matching nightly build tag is what the release page actually serves.
pub const LLAMA_TAG: &str = "b12359";

static RUNTIME_ROOT: OnceLock<PathBuf> = OnceLock::new();

/// Called once during app setup. The model layer reads the same root back so a
/// provisioned `llama-server` is preferred over whatever happens to be on PATH.
pub fn init(data_dir: &Path) -> PathBuf {
    let root = data_dir.join("runtimes");
    let _ = fs::create_dir_all(&root);
    let _ = RUNTIME_ROOT.set(root.clone());
    root
}

fn root() -> Option<PathBuf> {
    RUNTIME_ROOT.get().cloned()
}

fn llama_root() -> Option<PathBuf> {
    Some(root()?.join("llama").join(LLAMA_TAG))
}

const LLAMA_EXE: &str = if cfg!(windows) {
    "llama-server.exe"
} else {
    "llama-server"
};

/// Path to a provisioned llama-server, if the runtime was installed.
pub fn llama_server() -> Option<PathBuf> {
    find_binary(&llama_root()?, LLAMA_EXE)
}

fn find_binary(dir: &Path, name: &str) -> Option<PathBuf> {
    if !dir.is_dir() {
        return None;
    }
    // Walk shallowly: a handful of files, so this stays cheap.
    let mut stack = vec![dir.to_path_buf()];
    while let Some(next) = stack.pop() {
        let Ok(entries) = fs::read_dir(&next) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.file_name().and_then(|n| n.to_str()) == Some(name) {
                return Some(path);
            }
        }
    }
    None
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub key: String,
    pub label: String,
    pub installed: bool,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub llama_installed: bool,
    pub llama_version: Option<String>,
    pub llama_path: Option<String>,
    pub llama_tag: String,
    pub llama_asset: Option<String>,
    pub llama_size_mb: u64,
    pub tools: Vec<ToolStatus>,
    pub platform: String,
    pub can_auto_install_ocr: bool,
    pub ocr_hint: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProgress {
    pub kind: String,
    pub phase: String,
    pub message: String,
    pub downloaded: u64,
    pub total: u64,
}

fn emit(
    app: Option<&AppHandle>,
    kind: &str,
    phase: &str,
    message: &str,
    downloaded: u64,
    total: u64,
) {
    let Some(app) = app else {
        return;
    };
    let _ = app.emit(
        "runtime-progress",
        RuntimeProgress {
            kind: kind.into(),
            phase: phase.into(),
            message: message.into(),
            downloaded,
            total,
        },
    );
}

fn tool_version(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(120).collect())
}

fn which(program: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(program))
        .find(|candidate| candidate.is_file())
}

fn llama_version(path: &Path) -> Option<String> {
    let output = Command::new(path)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    text.lines()
        .map(str::trim)
        .find(|line| line.to_ascii_lowercase().contains("version"))
        .map(|line| line.chars().take(120).collect())
}

pub fn status() -> RuntimeStatus {
    let provisioned = llama_server();
    let on_path = which(LLAMA_EXE);
    let binary = provisioned.clone().or(on_path.clone());
    let version = binary.as_deref().and_then(llama_version);

    let tesseract = tool_version("tesseract", &["--version"]);
    let poppler = tool_version("pdftotext", &["-v"]);
    let pdftoppm = which(if cfg!(windows) {
        "pdftoppm.exe"
    } else {
        "pdftoppm"
    })
    .is_some();

    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let ocr_hint = ocr_hint();

    RuntimeStatus {
        llama_installed: binary.is_some(),
        llama_version: version,
        llama_path: binary.map(|p| p.to_string_lossy().to_string()),
        llama_tag: LLAMA_TAG.into(),
        llama_asset: llama_asset_name(),
        llama_size_mb: if cfg!(target_os = "macos") { 16 } else { 30 },
        tools: vec![
            ToolStatus {
                key: "tesseract".into(),
                label: "Tesseract OCR".into(),
                installed: tesseract.is_some(),
                detail: tesseract,
            },
            ToolStatus {
                key: "pdftotext".into(),
                label: "Poppler · optional text fallback".into(),
                installed: poppler.is_some(),
                detail: poppler,
            },
            ToolStatus {
                key: "pdftoppm".into(),
                label: "Poppler · optional render fallback".into(),
                installed: pdftoppm,
                detail: None,
            },
        ],
        platform,
        can_auto_install_ocr: (cfg!(target_os = "macos") && which("brew").is_some())
            || (cfg!(target_os = "windows") && which("winget").is_some()),
        ocr_hint,
    }
}

fn ocr_hint() -> String {
    if cfg!(target_os = "macos") {
        "brew install tesseract   # Poppler is optional; PDFium renders scans".into()
    } else if cfg!(target_os = "windows") {
        "winget install UB-Mannheim.TesseractOCR   # Poppler is optional".into()
    } else {
        "sudo apt install tesseract-ocr   # Poppler is optional".into()
    }
}

/// The release asset that matches this OS and CPU. `None` means there is no
/// official build and the UI should explain that rather than fail silently.
pub fn llama_asset_name() -> Option<String> {
    let tag = LLAMA_TAG;
    let name = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => format!("llama-{tag}-bin-macos-arm64.tar.gz"),
        ("macos", "x86_64") => format!("llama-{tag}-bin-macos-x64.tar.gz"),
        ("windows", "x86_64") => format!("llama-{tag}-bin-win-cpu-x64.zip"),
        ("windows", "aarch64") => format!("llama-{tag}-bin-win-cpu-arm64.zip"),
        ("linux", "x86_64") => format!("llama-{tag}-bin-ubuntu-x64.tar.gz"),
        ("linux", "aarch64") => format!("llama-{tag}-bin-ubuntu-arm64.tar.gz"),
        _ => return None,
    };
    Some(name)
}

fn download_url(asset: &str) -> String {
    format!("https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}/{asset}")
}

/// Install the requested helper. `kind` is `llama`, `ocr`, or `all`.
pub fn install(app: &AppHandle, kind: &str) -> Result<RuntimeStatus, String> {
    install_inner(Some(app), kind)
}

/// Install without emitting progress events. Used by the model path when the
/// user picks a GGUF before opening the runtime panel, so the first ask still
/// works instead of silently falling back to Ollama.
pub fn install_quiet(kind: &str) -> Result<RuntimeStatus, String> {
    install_inner(None, kind)
}

fn install_inner(app: Option<&AppHandle>, kind: &str) -> Result<RuntimeStatus, String> {
    match kind {
        "llama" => install_llama(app)?,
        "ocr" => install_ocr(app)?,
        "all" => {
            install_llama(app)?;
            install_ocr(app)?;
        }
        other => return Err(format!("Unknown runtime: {other}")),
    }
    Ok(status())
}

fn install_llama(app: Option<&AppHandle>) -> Result<(), String> {
    if llama_server().is_some() {
        emit(
            app,
            "llama",
            "done",
            "llama-server is already installed.",
            0,
            0,
        );
        return Ok(());
    }

    let asset = llama_asset_name().ok_or_else(|| {
        format!(
            "There is no official llama.cpp build for {}-{}. Use your package manager or build from source.",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;

    let target = llama_root().ok_or_else(|| "The runtime folder is not ready.".to_string())?;
    fs::create_dir_all(&target)
        .map_err(|e| format!("Could not create {}: {e}", target.display()))?;

    let archive = target.join(&asset);
    let url = download_url(&asset);
    emit(
        app,
        "llama",
        "download",
        &format!("Downloading llama.cpp {LLAMA_TAG}…"),
        0,
        0,
    );
    download(app, "llama", &url, &archive)?;

    emit(app, "llama", "extract", "Unpacking llama-server…", 0, 0);
    if asset.ends_with(".zip") {
        extract_zip(&archive, &target)?;
    } else {
        extract_tar_gz(&archive, &target)?;
    }
    let _ = fs::remove_file(&archive);

    #[cfg(unix)]
    {
        let binary = find_binary(&target, LLAMA_EXE)
            .ok_or_else(|| "The archive did not contain llama-server.".to_string())?;
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&binary, fs::Permissions::from_mode(0o755));
        // The shared libraries sit beside the binary; make them executable too.
        if let Some(parent) = binary.parent() {
            if let Ok(entries) = fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("dylib") {
                        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o755));
                    }
                }
            }
        }
    }
    #[cfg(not(unix))]
    find_binary(&target, LLAMA_EXE)
        .ok_or_else(|| "The archive did not contain llama-server.".to_string())?;

    emit(
        app,
        "llama",
        "done",
        "llama-server is installed and ready.",
        0,
        0,
    );
    Ok(())
}

fn download(app: Option<&AppHandle>, kind: &str, url: &str, dest: &Path) -> Result<(), String> {
    let response =
        reqwest::blocking::get(url).map_err(|e| format!("Could not download {url}: {e}"))?;
    let total = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);

    let mut reader = response;
    let mut file =
        fs::File::create(dest).map_err(|e| format!("Could not write {}: {e}", dest.display()))?;
    let mut buffer = vec![0u8; 256 * 1024];
    let mut downloaded = 0u64;
    let mut last_reported = 0u64;

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Download interrupted: {e}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|e| format!("Could not write the download: {e}"))?;
        downloaded += read as u64;

        if downloaded - last_reported >= 2 * 1024 * 1024 || downloaded == total {
            last_reported = downloaded;
            let pct = downloaded
                .checked_mul(100)
                .and_then(|value| value.checked_div(total))
                .map(|value| format!("{value}%"))
                .unwrap_or_else(|| format!("{} MB", downloaded / (1024 * 1024)));
            emit(
                app,
                kind,
                "download",
                &format!("Downloading… {pct}"),
                downloaded,
                total,
            );
        }
    }

    file.flush()
        .map_err(|e| format!("Could not save the download: {e}"))?;
    Ok(())
}

fn extract_tar_gz(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive)
        .map_err(|e| format!("Could not open {}: {e}", archive.display()))?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(decoder);
    tar.unpack(dest)
        .map_err(|e| format!("Could not extract the llama.cpp archive: {e}"))
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive)
        .map_err(|e| format!("Could not open {}: {e}", archive.display()))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| format!("Could not read the llama.cpp archive: {e}"))?;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|e| format!("Could not read the archive entry: {e}"))?;
        let Some(path) = entry.enclosed_name() else {
            continue;
        };
        let out = dest.join(path);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| format!("Could not create {out:?}: {e}"))?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Could not create {parent:?}: {e}"))?;
            }
            let mut target =
                fs::File::create(&out).map_err(|e| format!("Could not write {out:?}: {e}"))?;
            std::io::copy(&mut entry, &mut target)
                .map_err(|e| format!("Could not extract {out:?}: {e}"))?;
        }
    }
    Ok(())
}

fn install_ocr(app: Option<&AppHandle>) -> Result<(), String> {
    let before = status();
    if before
        .tools
        .iter()
        .find(|tool| tool.key == "tesseract")
        .is_some_and(|tool| tool.installed)
    {
        emit(
            app,
            "ocr",
            "done",
            "Tesseract OCR is already installed.",
            0,
            0,
        );
        return Ok(());
    }

    if cfg!(target_os = "macos") {
        if which("brew").is_none() {
            return Err(
                "Homebrew is not installed, so FrontDesk cannot install Tesseract/Poppler automatically. \
                 Install Homebrew from https://brew.sh, then retry."
                    .into(),
            );
        }
        emit(
            app,
            "ocr",
            "install",
            "Installing Tesseract with Homebrew. Poppler is optional because PDFium renders scans.",
            0,
            0,
        );
        let output = Command::new("brew")
            .args(["install", "tesseract"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Could not run Homebrew: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!(
                "Homebrew could not install the OCR helpers: {}",
                format!("{stdout} {stderr}").trim()
            ));
        }
        emit(app, "ocr", "done", "Tesseract OCR installed.", 0, 0);
        return Ok(());
    }

    if cfg!(target_os = "windows") {
        if which("winget").is_some() {
            emit(
                app,
                "ocr",
                "install",
                "Installing Tesseract with winget…",
                0,
                0,
            );
            let output = Command::new("winget")
                .args([
                    "install",
                    "--id",
                    "UB-Mannheim.TesseractOCR",
                    "-e",
                    "--silent",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                ])
                .output()
                .map_err(|e| format!("Could not run winget: {e}"))?;
            if !output.status.success() {
                return Err(format!(
                    "winget could not install Tesseract. Install it from https://github.com/UB-Mannheim/tesseract/wiki. {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
            emit(
                app,
                "ocr",
                "done",
                "Tesseract OCR installed. PDFium handles scan rendering; Poppler is optional.",
                0,
                0,
            );
            return Ok(());
        }
        return Err(format!(
            "No winget found. Install Tesseract manually: {}",
            ocr_hint()
        ));
    }

    Err(format!(
        "Automatic OCR install needs administrator privileges on Linux. Run: {}",
        ocr_hint()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_names_are_pinned_and_platform_specific() {
        if let Some(name) = llama_asset_name() {
            assert!(name.starts_with(&format!("llama-{LLAMA_TAG}-")));
            assert!(name.ends_with(".tar.gz") || name.ends_with(".zip"));
        }
    }

    /// Opt-in smoke test: point `FRONTDESK_TEST_DATA` at a real app-data
    /// directory to prove a provisioned runtime is discovered and executable.
    #[test]
    fn optional_provisioned_runtime_is_discovered() {
        let Some(dir) = std::env::var_os("FRONTDESK_TEST_DATA") else {
            return;
        };
        init(std::path::Path::new(&dir));
        let status = status();
        assert!(status.llama_installed, "{status:?}");
        assert!(status.llama_version.is_some(), "{status:?}");
    }

    #[test]
    fn finds_a_binary_nested_in_the_extracted_archive() {
        let dir = std::env::temp_dir().join(format!(
            "frontdesk-runtime-test-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let nested = dir.join("llama/build/bin");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join(LLAMA_EXE), b"stub").unwrap();

        assert_eq!(find_binary(&dir, LLAMA_EXE), Some(nested.join(LLAMA_EXE)));
        let _ = fs::remove_dir_all(&dir);
    }
}
