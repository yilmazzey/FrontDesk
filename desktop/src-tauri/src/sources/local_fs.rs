use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use walkdir::{DirEntry, WalkDir};

use crate::contracts::{SourceGrant, SourceRef};

const TEXT_EXTENSIONS: &[&str] = &["md", "markdown", "txt", "pdf", "tex", "html", "htm", "rst"];
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"];
const MAX_FILES: usize = 2_000;
const MAX_BYTES: u64 = 40 * 1024 * 1024;

fn skipped(entry: &DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy();
    if entry.file_type().is_dir() {
        matches!(
            name.as_ref(),
            ".git" | "node_modules" | "target" | "dist" | ".next" | ".cache"
        ) || name.starts_with('.')
    } else {
        name.starts_with('.')
    }
}

fn supported(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    TEXT_EXTENSIONS.contains(&ext.as_str()) || IMAGE_EXTENSIONS.contains(&ext.as_str())
}

fn modified(path: &Path) -> String {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
        .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339())
}

fn title(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .replace(['_', '-'], " ")
}

/// Scan a granted folder. Reads bytes only to fingerprint the file; it never
/// writes or caches a copy.
pub fn scan(grant: &SourceGrant) -> Vec<SourceRef> {
    let root = PathBuf::from(&grant.scope);
    if !root.exists() {
        return Vec::new();
    }

    let mut out = Vec::new();

    if root.is_file() {
        if let Some(source) = one_file(&root, grant) {
            out.push(source);
        }
        return out;
    }

    for entry in WalkDir::new(&root)
        .max_depth(8)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !skipped(e))
        .filter_map(Result::ok)
    {
        if out.len() >= MAX_FILES {
            break;
        }
        let path = entry.path();
        if !entry.file_type().is_file() || !supported(path) {
            continue;
        }
        if let Some(source) = one_file(path, grant) {
            out.push(source);
        }
    }

    out
}

fn one_file(path: &Path, grant: &SourceGrant) -> Option<SourceRef> {
    let meta = fs::metadata(path).ok()?;
    if meta.len() > MAX_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let location = path.to_string_lossy().to_string();
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let kind = if IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        "ocr"
    } else {
        "file"
    };
    Some(SourceRef {
        id: format!("file:{}", &super::sha256_hex(location.as_bytes())[..20]),
        grant_id: grant.id.clone(),
        kind: kind.into(),
        title: title(path),
        location,
        modified: modified(path),
        hash: super::sha256_hex(&bytes),
    })
}

/// Fetch the original text at query time. PDFs use their embedded text layer;
/// images are OCR'd locally with Tesseract. Nothing is persisted.
pub fn read_text(path: &str) -> Result<String, String> {
    let path = Path::new(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match ext.as_str() {
        "md" | "markdown" | "txt" | "tex" | "rst" => {
            fs::read_to_string(path).map_err(|e| format!("Could not read {}: {e}", path.display()))
        }
        "html" | "htm" => {
            let raw = fs::read_to_string(path)
                .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
            Ok(strip_html(&raw))
        }
        "pdf" => {
            let text = run_tool("pdftotext", &[path.to_string_lossy().as_ref(), "-"])?;
            if text.trim().is_empty() {
                // No embedded text layer: rasterise page by page and OCR locally.
                ocr_pdf(path)
            } else {
                Ok(text)
            }
        }
        "png" | "jpg" | "jpeg" | "webp" | "tif" | "tiff" | "bmp" => {
            run_tool("tesseract", &[path.to_string_lossy().as_ref(), "stdout"])
        }
        _ => Err(format!("Unsupported source type: .{ext}")),
    }
}

/// Render each page to a temporary image, OCR it, and delete the render. The
/// OCR text is returned to the caller's memory; the temp folder is always
/// removed, including when extraction fails partway through.
fn ocr_pdf(path: &Path) -> Result<String, String> {
    let stamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default();
    let dir = std::env::temp_dir().join(format!("frontdesk-ocr-{}-{stamp}", std::process::id()));
    fs::create_dir_all(&dir).map_err(|e| format!("Could not prepare OCR: {e}"))?;

    let prefix = dir.join("page");
    let result = (|| {
        let output = Command::new("pdftoppm")
            .args(["-png", "-r", "170"])
            .arg(path)
            .arg(&prefix)
            .output()
            .map_err(|e| format!("pdftoppm is not available: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "pdftoppm failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }

        let mut pages: Vec<PathBuf> = fs::read_dir(&dir)
            .map_err(|e| format!("Could not list OCR pages: {e}"))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|entry| entry.extension().and_then(|e| e.to_str()) == Some("png"))
            .collect();
        pages.sort();

        let mut text = String::new();
        for page in pages {
            text.push_str(&run_tool(
                "tesseract",
                &[page.to_string_lossy().as_ref(), "stdout"],
            )?);
            text.push('\u{0c}');
        }
        Ok(text)
    })();

    let _ = fs::remove_dir_all(&dir);
    result
}

fn run_tool(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("{program} is not available: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{program} failed: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Minimal HTML to text. Scripts and styles are dropped, tags become spaces,
/// and whitespace is collapsed so the chunker sees readable prose.
fn strip_html(raw: &str) -> String {
    let mut text = raw.to_string();

    for tag in ["script", "style"] {
        loop {
            let lower = text.to_ascii_lowercase();
            let Some(open) = lower.find(&format!("<{tag}")) else {
                break;
            };
            let Some(close_offset) = lower[open..].find(&format!("</{tag}")) else {
                text.truncate(open);
                break;
            };
            let close = open + close_offset;
            let end = text[close..]
                .find('>')
                .map(|offset| close + offset + 1)
                .unwrap_or(text.len());
            text.replace_range(open..end, " ");
        }
    }

    let mut out = String::with_capacity(text.len());
    let mut inside_tag = false;
    for ch in text.chars() {
        match ch {
            '<' => {
                inside_tag = true;
                out.push(' ');
            }
            '>' => inside_tag = false,
            _ if !inside_tag => out.push(ch),
            _ => {}
        }
    }

    for (entity, value) in [
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&#39;", "'"),
    ] {
        out = out.replace(entity, value);
    }

    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
