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

/// Scan a granted folder using metadata only. File bodies are read later, only
/// when a candidate is actually opened or answered from. It never writes or
/// caches a copy.
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
        // A cheap version key: no file body is read just to list a folder.
        hash: super::sha256_hex(format!("{}:{}", meta.len(), modified(path)).as_bytes()),
        people: Vec::new(),
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
            // Read the embedded text layer in-process first. This means PDFs
            // still work in a packaged build where `pdftotext` is absent.
            if let Ok(text) = pdf_extract::extract_text(path) {
                if !text.trim().is_empty() {
                    return Ok(text);
                }
            }

            // Fall back to Poppler when it is available; some scanned PDFs
            // carry an outline that only pdftotext picks up.
            if let Ok(text) = run_tool("pdftotext", &[path.to_string_lossy().as_ref(), "-"]) {
                if !text.trim().is_empty() {
                    return Ok(text);
                }
            }

            // No embedded text layer: rasterise page by page and OCR locally.
            ocr_pdf(path)
        }
        "png" | "jpg" | "jpeg" | "webp" | "tif" | "tiff" | "bmp" => {
            run_tool("tesseract", &[path.to_string_lossy().as_ref(), "stdout"])
        }
        _ => Err(format!("Unsupported source type: .{ext}")),
    }
}

/// Render each page to a temporary PPM, OCR it, and delete the render. PDFium
/// is loaded from its verified local cache, so Poppler is not required. If
/// PDFium cannot load, fall back to pdftoppm when it is available.
fn ocr_pdf(path: &Path) -> Result<String, String> {
    let stamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default();
    let dir = std::env::temp_dir().join(format!("frontdesk-ocr-{}-{stamp}", std::process::id()));
    fs::create_dir_all(&dir).map_err(|e| format!("Could not prepare OCR: {e}"))?;

    let result = ocr_pdf_pdfium(path, &dir).or_else(|pdfium_error| {
        if Command::new("pdftoppm").arg("-v").output().is_ok() {
            ocr_pdf_poppler(path, &dir)
        } else {
            Err(format!(
                "PDF OCR needs PDFium or pdftoppm. PDFium failed: {pdfium_error}"
            ))
        }
    });

    let _ = fs::remove_dir_all(&dir);
    result
}

fn ocr_pdf_pdfium(path: &Path, dir: &Path) -> Result<String, String> {
    use pdfium_render::prelude::{PdfBitmapFormat, PdfRenderConfig};

    let pdfium = pdfium_bundled::bind_pdfium_silent()
        .map_err(|error| format!("Could not load the local PDF renderer: {error}"))?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|error| format!("Could not open the PDF for OCR: {error}"))?;
    let config = PdfRenderConfig::new()
        .set_target_width(1700)
        .set_format(PdfBitmapFormat::BGRA);

    let mut text = String::new();
    for index in 0..document.pages().len() {
        let page = document
            .pages()
            .get(index)
            .map_err(|error| format!("Could not read PDF page {}: {error}", index + 1))?;
        let bitmap = page
            .render_with_config(&config)
            .map_err(|error| format!("Could not render PDF page {}: {error}", index + 1))?;
        let width = bitmap.width() as usize;
        let height = bitmap.height() as usize;
        let rgba = bitmap.as_rgba_bytes();
        let page_path = dir.join(format!("page-{index:04}.ppm"));
        write_ppm(&page_path, &rgba, width, height)?;
        text.push_str(&run_tool(
            "tesseract",
            &[page_path.to_string_lossy().as_ref(), "stdout"],
        )?);
        text.push('\u{0c}');
    }
    Ok(text)
}

fn write_ppm(path: &Path, rgba: &[u8], width: usize, height: usize) -> Result<(), String> {
    let mut output = format!("P6\n{width} {height}\n255\n").into_bytes();
    for pixel in rgba.as_chunks::<4>().0 {
        output.extend_from_slice(&pixel[..3]);
    }
    fs::write(path, output).map_err(|error| format!("Could not write an OCR page: {error}"))
}

fn ocr_pdf_poppler(path: &Path, dir: &Path) -> Result<String, String> {
    let prefix = dir.join("page");
    let output = Command::new("pdftoppm")
        .args(["-png", "-r", "170"])
        .arg(path)
        .arg(&prefix)
        .output()
        .map_err(|error| format!("pdftoppm is not available: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "pdftoppm failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let mut pages: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|error| format!("Could not list OCR pages: {error}"))?
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
}

fn run_tool(program: &str, args: &[&str]) -> Result<String, String> {
    // Resolve Homebrew paths too: Finder-launched apps do not inherit the
    // user's interactive shell PATH.
    let binary =
        crate::runtime::which(program).unwrap_or_else(|| std::path::PathBuf::from(program));
    let output = Command::new(binary).args(args).output().map_err(|e| {
        format!(
            "{program} is not available: {e}. Install the OCR helpers from \
                 Access → Local runtime, or run the package-manager command shown there."
        )
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{program} failed: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Minimal HTML to text. Scripts and styles are dropped, tags become spaces,
/// and whitespace is collapsed so the chunker sees readable prose.
pub(crate) fn strip_html(raw: &str) -> String {
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
