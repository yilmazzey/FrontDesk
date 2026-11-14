use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::Path;

use crate::contracts::{Answer, Citation, Clarification, SourceGrant};
use crate::model;
use crate::retrieve::bm25::{self, Scored};
use crate::retrieve::chunker::{self, Chunk};
use crate::sources;

pub struct PipelineResult {
    pub answer: Answer,
    pub read_sources: Vec<String>,
}

const MIN_SCORE: f64 = 0.5;
const MAX_EXCERPTS: usize = 6;

pub fn ask(
    question: &str,
    grants: &[SourceGrant],
    selected_model: Option<&str>,
    models_dir: &Path,
) -> PipelineResult {
    let question = question.trim();
    if question.is_empty() {
        return PipelineResult {
            answer: Answer::insufficient("none"),
            read_sources: Vec::new(),
        };
    }

    let source_refs = sources::list_all(grants);
    if source_refs.is_empty() {
        return PipelineResult {
            answer: Answer::insufficient("none"),
            read_sources: Vec::new(),
        };
    }

    let mut chunks: Vec<Chunk> = Vec::new();
    let mut read_sources = Vec::new();

    // Read originals on the fly. If a source disappears or fails to parse we
    // simply answer from the rest; we never fall back to a stale copy.
    for source in &source_refs {
        if let Ok(text) = sources::read_text(source) {
            read_sources.push(source.id.clone());
            chunks.extend(chunker::chunk_source(source, &text));
        }
    }

    if chunks.is_empty() {
        return PipelineResult {
            answer: Answer::insufficient("none"),
            read_sources,
        };
    }

    let scored = bm25::search(question, &chunks, MAX_EXCERPTS);
    if scored.is_empty() || scored[0].score < MIN_SCORE {
        return PipelineResult {
            answer: Answer::insufficient("none"),
            read_sources,
        };
    }

    // A single incidental word ("say" in an unrelated sentence) is not enough
    // evidence. Require at least half of the question's content words to appear
    // in the top few retrieved chunks; otherwise refuse honestly.
    let query_words: HashSet<String> = bm25::content_words(question).into_iter().collect();
    let visible_words: HashSet<String> = scored
        .iter()
        .take(3)
        .flat_map(|item| bm25::content_words(&item.chunk.text))
        .collect();
    let matched = query_words.intersection(&visible_words).count();
    let needed = if query_words.len() <= 1 {
        1
    } else {
        ((query_words.len() as f64) * 0.5).ceil() as usize
    };
    if matched < needed {
        return PipelineResult {
            answer: Answer::insufficient("none"),
            read_sources,
        };
    }

    let excerpts: Vec<Chunk> = scored
        .iter()
        .take(MAX_EXCERPTS)
        .map(|s| s.chunk.clone())
        .collect();

    if let Some(clarification) = clarify(question, &scored) {
        return PipelineResult {
            answer: Answer {
                status: "needs_clarification".into(),
                text:
                    "I can answer that from more than one allowed source. Which one did you mean?"
                        .into(),
                citations: Vec::new(),
                clarification: Some(clarification),
                model: "none".into(),
            },
            read_sources,
        };
    }

    let Some(model_id) = selected_model.filter(|id| !id.is_empty() && *id != "extractive") else {
        let (text, cited) = extractive(question, &excerpts);
        return PipelineResult {
            answer: answered(text, &cited, &excerpts, "extractive"),
            read_sources,
        };
    };

    let system =
        "You are FrontDesk, a local-first assistant. Answer ONLY from the numbered excerpts. \
Every factual sentence must end with the excerpt number in square brackets, for example [1]. \
Never use outside knowledge, never guess, and never invent a citation. \
If the excerpts do not contain the answer, reply exactly NOT_IN_SOURCES. \
Keep the answer to one to three short sentences.";

    let mut user = String::from("Excerpts:\n\n");
    for (index, excerpt) in excerpts.iter().enumerate() {
        user.push_str(&format!(
            "[{}] {} — {} (as of {})\n{}\n\n",
            index + 1,
            excerpt.title,
            excerpt.location,
            excerpt.timestamp,
            excerpt.text
        ));
    }
    user.push_str(&format!("Question: {question}\n"));

    match model::generate(models_dir, model_id, system, &user) {
        Ok(raw) => match verify(&raw, &excerpts) {
            Some((text, cited)) => PipelineResult {
                answer: answered(text, &cited, &excerpts, &format!("gguf:{model_id}")),
                read_sources,
            },
            None => PipelineResult {
                answer: Answer::insufficient(&format!("gguf:{model_id}")),
                read_sources,
            },
        },
        Err(error) => {
            // A model failure must never turn into a guess. Fall back to the
            // extractive adapter, which is inherently citation-bound.
            let (text, cited) = extractive(question, &excerpts);
            let mut answer = answered(text, &cited, &excerpts, "extractive");
            answer.text = format!(
                "{}\n\n(The local model could not run: {error}. This answer is extractive.)",
                answer.text
            );
            PipelineResult {
                answer,
                read_sources,
            }
        }
    }
}

fn answered(text: String, cited: &[usize], excerpts: &[Chunk], model: &str) -> Answer {
    Answer {
        status: "answered".into(),
        text,
        citations: citations_for(cited, excerpts),
        clarification: None,
        model: model.into(),
    }
}

fn citations_for(indices: &[usize], excerpts: &[Chunk]) -> Vec<Citation> {
    indices
        .iter()
        .filter_map(|index| excerpts.get(index.saturating_sub(1)))
        .map(|chunk| Citation {
            id: format!("c{}", chunk.source_id),
            source_id: chunk.source_id.clone(),
            source_type: chunk.source_type.clone(),
            title: chunk.title.clone(),
            location: chunk.location.clone(),
            timestamp: chunk.timestamp.clone(),
            excerpt: chunk.text.clone(),
            deep_link: None,
        })
        .collect()
}

fn extractive(question: &str, excerpts: &[Chunk]) -> (String, Vec<usize>) {
    let best = &excerpts[0];
    let question_words: HashSet<String> = bm25::content_words(question).into_iter().collect();

    let mut sentences: Vec<(usize, usize)> = Vec::new();
    for (order, sentence) in split_sentences(&best.text).into_iter().enumerate() {
        let words: HashSet<String> = bm25::content_words(&sentence).into_iter().collect();
        let overlap = words.intersection(&question_words).count();
        if overlap > 0 {
            sentences.push((overlap, order));
        }
    }
    sentences.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));

    let chosen: Vec<usize> = sentences.iter().take(2).map(|(_, order)| *order).collect();

    let all = split_sentences(&best.text);
    let picked: Vec<String> = if chosen.is_empty() {
        all.iter().take(2).cloned().collect()
    } else {
        let mut sorted = chosen;
        sorted.sort_unstable();
        sorted
            .into_iter()
            .filter_map(|index| all.get(index).cloned())
            .collect()
    };

    let body = if picked.is_empty() {
        best.text.chars().take(600).collect::<String>()
    } else {
        picked.join(" ")
    };

    (
        format!("From “{}” ({}): {}", best.title, best.location, body),
        vec![1],
    )
}

fn clarify(question: &str, scored: &[Scored]) -> Option<Clarification> {
    if scored.len() < 2 {
        return None;
    }

    let mut per_source: HashMap<&str, f64> = HashMap::new();
    for item in scored.iter().take(4) {
        per_source
            .entry(item.chunk.source_id.as_str())
            .and_modify(|score| {
                if item.score > *score {
                    *score = item.score;
                }
            })
            .or_insert(item.score);
    }

    if per_source.len() < 2 {
        return None;
    }

    let mut ranked: Vec<(&str, f64)> = per_source.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let first = ranked[0].1;
    let second = ranked[1].1;
    if first <= 0.0 || second / first < 0.82 {
        return None;
    }

    let words = question.split_whitespace().count();
    let lower = question.to_lowercase();
    let ambiguous_marker = [
        "document", "report", "protocol", "notes", "plan", "it", "this",
    ]
    .iter()
    .any(|marker| {
        lower
            .split_whitespace()
            .any(|word| word.trim_matches(|c: char| !c.is_alphanumeric()) == *marker)
    });

    if words > 12 && !ambiguous_marker {
        return None;
    }

    let options: Vec<String> = scored
        .iter()
        .filter(|item| item.chunk.source_id == ranked[0].0 || item.chunk.source_id == ranked[1].0)
        .map(|item| item.chunk.title.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();

    Some(Clarification {
        question: "More than one allowed source matches equally. Which one should I read?".into(),
        options,
    })
}

/// Accept a model answer only when every kept sentence carries a valid
/// citation and shares at least one content word with the cited excerpt.
fn verify(raw: &str, excerpts: &[Chunk]) -> Option<(String, Vec<usize>)> {
    if raw.to_uppercase().contains("NOT_IN_SOURCES") {
        return None;
    }

    let mut kept: Vec<String> = Vec::new();
    let mut cited: BTreeSet<usize> = BTreeSet::new();

    for sentence in split_sentences(raw) {
        let refs = refs_in(&sentence);
        let valid: Vec<usize> = refs
            .into_iter()
            .filter(|index| *index >= 1 && *index <= excerpts.len())
            .collect();
        if valid.is_empty() {
            continue;
        }

        let sentence_words: HashSet<String> = bm25::content_words(&sentence).into_iter().collect();

        let grounded = valid.iter().any(|index| {
            let excerpt_words: HashSet<String> = bm25::content_words(&excerpts[*index - 1].text)
                .into_iter()
                .collect();
            !sentence_words.is_disjoint(&excerpt_words)
        });
        if !grounded {
            continue;
        }

        for index in valid {
            cited.insert(index);
        }

        let clean = strip_refs(&sentence);
        if !clean.trim().is_empty() {
            kept.push(clean.trim().to_string());
        }
    }

    if kept.is_empty() {
        None
    } else {
        Some((kept.join(" "), cited.into_iter().collect()))
    }
}

fn split_sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut start = 0;

    for (index, ch) in text.char_indices() {
        if matches!(ch, '.' | '!' | '?' | '\n') {
            let end = index + ch.len_utf8();
            let piece = text[start..end].trim();
            if !piece.is_empty() {
                out.push(piece.to_string());
            }
            start = end;
        }
    }

    if start < text.len() {
        let piece = text[start..].trim();
        if !piece.is_empty() {
            out.push(piece.to_string());
        }
    }

    out
}

fn refs_in(text: &str) -> Vec<usize> {
    let mut out = Vec::new();
    let mut digits = String::new();
    let mut inside = false;

    for ch in text.chars() {
        match ch {
            '[' => {
                inside = true;
                digits.clear();
            }
            ']' if inside => {
                if let Ok(index) = digits.parse::<usize>() {
                    out.push(index);
                }
                inside = false;
                digits.clear();
            }
            _ if inside && ch.is_ascii_digit() => digits.push(ch),
            _ if inside => {
                inside = false;
                digits.clear();
            }
            _ => {}
        }
    }

    out
}

fn strip_refs(text: &str) -> String {
    let mut out = String::new();
    let mut inside = false;

    for ch in text.chars() {
        match ch {
            '[' => inside = true,
            ']' if inside => {
                inside = false;
                out.push(' ');
            }
            _ if inside && !ch.is_ascii_digit() => {
                inside = false;
                out.push(ch);
            }
            _ if !inside => out.push(ch),
            _ => {}
        }
    }

    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
