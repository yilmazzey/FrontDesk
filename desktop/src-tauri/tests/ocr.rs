use std::fs;
use std::path::{Path, PathBuf};

use frontdesk_lib::answer;
use frontdesk_lib::contracts::SourceGrant;

fn scans() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/scans")
}

fn grants() -> Vec<SourceGrant> {
    let image = scans().join("memo.png");
    vec![SourceGrant {
        id: "file:scans".into(),
        kind: "file".into(),
        scope: image.to_string_lossy().to_string(),
        title: "Scanned memo".into(),
        granted_at: "2026-11-14T00:00:00Z".into(),
    }]
}

/// Phase 4: a scanned image in a granted folder is OCR'd on demand, cited by
/// page, and nothing is written next to the original or to app data.
#[test]
fn scanned_page_is_cited_by_page_and_not_persisted() {
    let folder = scans();
    let before = fs::read_dir(&folder).unwrap().count();

    let result = answer::ask(
        "What is the retention window for scanned documents?",
        &grants(),
        None,
        Path::new("."),
    );
    let answer = result.answer;

    assert_eq!(answer.status, "answered", "OCR page should answer");
    assert!(!answer.citations.is_empty());

    let citation = &answer.citations[0];
    assert_eq!(citation.source_type, "ocr");
    assert!(
        citation.location.starts_with("page "),
        "OCR citation should carry a page, got {}",
        citation.location
    );
    assert!(
        citation.excerpt.contains("seven years"),
        "citation must carry the fetched OCR text, got {}",
        citation.excerpt
    );

    let after = fs::read_dir(&folder).unwrap().count();
    assert_eq!(before, after, "OCR must not write output into the folder");
}

/// A PDF with no text layer is rendered page by page and OCR'd. The temporary
/// render is deleted before the answer is built.
#[test]
fn scanned_pdf_without_text_layer_is_ocrd() {
    let path = scans().join("memo-scanned.pdf");
    let text = frontdesk_lib::sources::read_text(&frontdesk_lib::contracts::SourceRef {
        id: "file:scanned-pdf".into(),
        grant_id: "file:scans".into(),
        kind: "ocr".into(),
        title: "Scanned PDF".into(),
        location: path.to_string_lossy().to_string(),
        modified: "2026-11-14T00:00:00Z".into(),
        hash: "0".into(),
    })
    .expect("scanned PDF should OCR");

    assert!(text.contains("retention"), "OCR text was: {text}");

    let leftovers = fs::read_dir(std::env::temp_dir())
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("frontdesk-ocr-")
        })
        .count();
    assert_eq!(leftovers, 0, "OCR temp render must be deleted");
}
