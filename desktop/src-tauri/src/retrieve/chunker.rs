use crate::contracts::SourceRef;

/// A short, citable window into one source. Built in memory for one query.
#[derive(Debug, Clone)]
pub struct Chunk {
    pub source_id: String,
    pub source_type: String,
    pub title: String,
    /// Where the excerpt sits inside the source (page or part).
    pub location: String,
    /// The original file path or URL, used for routing only.
    pub origin: String,
    pub timestamp: String,
    pub text: String,
}

const TARGET: usize = 1_000;
const HARD_MAX: usize = 1_400;

pub fn chunk_source(source: &SourceRef, text: &str) -> Vec<Chunk> {
    let pages: Vec<&str> = text.split('\u{0c}').collect();
    let multi_page = pages.len() > 1;
    let mut out = Vec::new();

    for (page_index, page) in pages.iter().enumerate() {
        let page = page.trim();
        if page.is_empty() {
            continue;
        }

        let mut buffer = String::new();

        for paragraph in page.split("\n\n") {
            let paragraph = paragraph.trim();
            if paragraph.is_empty() {
                continue;
            }

            if paragraph.len() > HARD_MAX {
                if !buffer.is_empty() {
                    flush(&mut out, source, &buffer, page_index, multi_page);
                    buffer.clear();
                }
                for piece in split_chars(paragraph, TARGET) {
                    flush(&mut out, source, piece, page_index, multi_page);
                }
                continue;
            }

            if !buffer.is_empty() && buffer.len() + paragraph.len() > TARGET {
                flush(&mut out, source, &buffer, page_index, multi_page);
                buffer.clear();
            }

            buffer.push_str(paragraph);
            buffer.push_str("\n\n");
        }

        if !buffer.trim().is_empty() {
            flush(&mut out, source, &buffer, page_index, multi_page);
        }
    }

    out
}

fn flush(
    out: &mut Vec<Chunk>,
    source: &SourceRef,
    text: &str,
    page_index: usize,
    multi_page: bool,
) {
    let text = text.trim();
    if text.is_empty() {
        return;
    }
    let location = if source.kind == "ocr" {
        format!("page {} · scanned image", page_index + 1)
    } else if multi_page {
        format!("page {}", page_index + 1)
    } else {
        format!("part {}", out.len() + 1)
    };
    out.push(Chunk {
        source_id: source.id.clone(),
        source_type: source.kind.clone(),
        title: source.title.clone(),
        location,
        origin: source.location.clone(),
        timestamp: source.modified.clone(),
        text: text.to_string(),
    });
}

fn split_chars(text: &str, size: usize) -> Vec<&str> {
    let mut pieces = Vec::new();
    let mut start = 0;

    for (index, ch) in text.char_indices() {
        if index - start >= size && (ch.is_whitespace() || ch == '.' || ch == ',') {
            let piece = text[start..index].trim();
            if !piece.is_empty() {
                pieces.push(piece);
            }
            start = index;
        }
    }

    if start < text.len() {
        let piece = text[start..].trim();
        if !piece.is_empty() {
            pieces.push(piece);
        }
    }

    pieces
}
