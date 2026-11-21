use std::collections::{HashMap, HashSet};

use super::chunker::Chunk;

#[derive(Debug, Clone)]
pub struct Scored {
    pub score: f64,
    pub chunk: Chunk,
}

const STOPWORDS: &[&str] = &[
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "than",
    "that",
    "this",
    "these",
    "those",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "as",
    "by",
    "at",
    "from",
    "it",
    "its",
    "i",
    "you",
    "we",
    "they",
    "he",
    "she",
    "do",
    "does",
    "did",
    "what",
    "which",
    "who",
    "when",
    "where",
    "why",
    "how",
    "about",
    "can",
    "could",
    "should",
    "would",
    "will",
    "shall",
    "may",
    "might",
    "must",
    "have",
    "has",
    "had",
    "not",
    "no",
    "yes",
    "me",
    "my",
    "our",
    "your",
    "their",
    "there",
    "here",
    "so",
    "very",
    "just",
    "also",
    "any",
    // Contraction fragments left behind by tokenisation ("you're" → you/re).
    "re",
    "ve",
    "ll",
    // Conversational framing that should not count as evidence.
    "catch",
    "up",
    "tell",
    "explain",
    "describe",
    "give",
    "show",
    "list",
    "summarize",
    "summarise",
    "please",
];

/// Hyphenated and spaced compounds are collapsed before tokenising. Without
/// this, "sign-off" becomes ["sign", "off"] and matches every unrelated
/// "sign-in" notification in the mailbox.
const COMPOUNDS: &[(&str, &str)] = &[
    ("one on one", "oneonone"),
    ("one-on-one", "oneonone"),
    ("1 on 1", "oneonone"),
    ("1-on-1", "oneonone"),
    ("1:1", "oneonone"),
    ("sign-off", "signoff"),
    ("sign off", "signoff"),
    ("sign-in", "signin"),
    ("sign in", "signin"),
    ("sign-up", "signup"),
    ("sign up", "signup"),
    ("follow-up", "followup"),
    ("follow up", "followup"),
    ("check-in", "checkin"),
    ("check in", "checkin"),
    ("roll-out", "rollout"),
    ("roll out", "rollout"),
    ("opt-in", "optin"),
    ("opt in", "optin"),
    ("set-up", "setup"),
    ("set up", "setup"),
];

fn tokens(text: &str) -> Vec<String> {
    let mut normalized = text.to_lowercase();
    for (from, to) in COMPOUNDS {
        normalized = normalized.replace(from, to);
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::retrieve::chunker::Chunk;

    fn chunk(id: &str, text: &str) -> Chunk {
        Chunk {
            source_id: id.into(),
            source_type: "file".into(),
            title: "Fixture".into(),
            location: "part 1".into(),
            origin: "/tmp/fixture.md".into(),
            timestamp: "2026-11-14T00:00:00Z".into(),
            text: text.into(),
        }
    }

    #[test]
    fn hyphenated_compounds_do_not_collide() {
        let sign_off = tokens("Waiting on Priya for the budget sign-off");
        assert!(sign_off.contains(&"signoff".to_string()));
        assert!(!sign_off.contains(&"sign".to_string()));

        let sign_in = tokens("New sign-in detected for your Microsoft account");
        assert!(sign_in.contains(&"signin".to_string()));
        assert!(!sign_in.contains(&"sign".to_string()));
    }

    #[test]
    fn sign_off_question_does_not_retrieve_sign_in_mail() {
        let note = chunk(
            "file:note",
            "Waiting on Priya for the budget sign-off. Follow up with Marcus by Monday.",
        );
        let security = chunk(
            "mail:security",
            "We detected a new sign-in to your Microsoft account.",
        );

        let hits = search(
            "Catch me up on: Waiting on Priya for the budget sign-off",
            &[note, security],
            6,
        );

        assert_eq!(hits.len(), 1, "only the sign-off note should match");
        assert_eq!(hits[0].chunk.source_id, "file:note");
    }
}
