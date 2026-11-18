use std::collections::{HashMap, HashSet};

use super::chunker::Chunk;

#[derive(Debug, Clone)]
pub struct Scored {
    pub score: f64,
    pub chunk: Chunk,
}

const STOPWORDS: &[&str] = &[
    "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this", "these", "those",
    "is", "are", "was", "were", "be", "been", "being", "to", "of", "in", "on", "for", "with", "as",
    "by", "at", "from", "it", "its", "i", "you", "we", "they", "he", "she", "do", "does", "did",
    "what", "which", "who", "when", "where", "why", "how", "about", "can", "could", "should",
    "would", "will", "shall", "may", "might", "must", "have", "has", "had", "not", "no", "yes",
    "me", "my", "our", "your", "their", "there", "here", "so", "very", "just", "also", "any",
];

fn tokens(text: &str) -> Vec<String> {
    let normalized = text
        .to_lowercase()
        .replace("1:1", "oneonone")
        .replace("1-on-1", "oneonone")
        .replace("1 on 1", "oneonone");
    normalized
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| {
            !t.is_empty()
                && (t.len() >= 2 || t.chars().all(|c| c.is_ascii_digit()))
                && !STOPWORDS.contains(t)
        })
        .map(|t| t.to_string())
        .collect()
}

/// BM25 over in-memory chunks. The index is built from the excerpts of
/// currently granted sources and disappears when the query is done.
pub fn search(question: &str, chunks: &[Chunk], limit: usize) -> Vec<Scored> {
    if chunks.is_empty() {
        return Vec::new();
    }

    let query: Vec<String> = {
        let mut seen = HashSet::new();
        tokens(question)
            .into_iter()
            .filter(|t| seen.insert(t.clone()))
            .collect()
    };
    if query.is_empty() {
        return Vec::new();
    }

    let docs: Vec<Vec<String>> = chunks
        .iter()
        .map(|c| tokens(&format!("{} {}", c.title, c.text)))
        .collect();
    let total_docs = docs.len() as f64;
    let average_len = docs.iter().map(Vec::len).sum::<usize>() as f64 / total_docs;

    let mut document_frequency: HashMap<&str, f64> = HashMap::new();
    for term in &query {
        let count = docs
            .iter()
            .filter(|doc| doc.iter().any(|t| t == term))
            .count() as f64;
        document_frequency.insert(term.as_str(), count);
    }

    let k1 = 1.5;
    let b = 0.75;
    let mut scored: Vec<Scored> = docs
        .iter()
        .enumerate()
        .map(|(index, doc)| {
            let doc_len = doc.len() as f64;
            let mut score = 0.0;

            for term in &query {
                let frequency = doc.iter().filter(|t| *t == term).count() as f64;
                if frequency == 0.0 {
                    continue;
                }
                let df = *document_frequency.get(term.as_str()).unwrap_or(&0.0);
                let idf = (1.0 + (total_docs - df + 0.5) / (df + 0.5)).ln();
                let denominator = frequency + k1 * (1.0 - b + b * doc_len / average_len.max(1.0));
                score += idf * (frequency * (k1 + 1.0)) / denominator;
            }

            Scored {
                score,
                chunk: chunks[index].clone(),
            }
        })
        .filter(|s| s.score > 0.0)
        .collect();

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(limit);
    scored
}

pub fn content_words(text: &str) -> Vec<String> {
    tokens(text)
}
