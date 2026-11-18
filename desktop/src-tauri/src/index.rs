use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::contracts::SourceRef;
use crate::retrieve::chunker::Chunk;

const EMBEDDING_MODEL: &str = "all-MiniLM-L6-v2";
const MIN_SIMILARITY: f32 = 0.42;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub sources: u64,
    pub indexed_sources: u64,
    pub chunks: u64,
    pub model: String,
}

#[derive(Debug, Clone)]
pub struct IndexHit {
    pub source_id: String,
    pub chunk_index: usize,
    pub score: f32,
}

#[derive(Debug, Clone)]
pub struct KeywordHit {
    pub source_id: String,
    pub score: f32,
}

pub struct IndexStore {
    connection: Mutex<Connection>,
}

impl IndexStore {
    pub fn open(data_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir)
            .map_err(|error| format!("Could not create the index folder: {error}"))?;
        let path = data_dir.join("retrieval.sqlite");
        let connection = Connection::open(path)
            .map_err(|error| format!("Could not open the metadata index: {error}"))?;
        connection
            .execute_batch(
                "
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL,
                    location TEXT NOT NULL,
                    modified TEXT NOT NULL,
                    version TEXT NOT NULL,
                    people TEXT NOT NULL DEFAULT '[]',
                    indexed_version TEXT,
                    indexed_at TEXT
                );
                CREATE TABLE IF NOT EXISTS chunks (
                    source_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    location TEXT NOT NULL,
                    embedding BLOB NOT NULL,
                    model TEXT NOT NULL,
                    PRIMARY KEY (source_id, chunk_index)
                );
                CREATE INDEX IF NOT EXISTS chunks_source ON chunks(source_id);
                ",
            )
            .map_err(|error| format!("Could not prepare the metadata index: {error}"))?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn upsert_sources(&self, sources: &[SourceRef]) -> Result<(), String> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| "The metadata index lock was poisoned.".to_string())?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("Could not start the metadata transaction: {error}"))?;
        {
            let mut statement = transaction
                .prepare(
                    "
                    INSERT INTO sources (id, kind, title, location, modified, version, people)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                    ON CONFLICT(id) DO UPDATE SET
                        kind = excluded.kind,
                        title = excluded.title,
                        location = excluded.location,
                        modified = excluded.modified,
                        people = excluded.people,
                        indexed_version = CASE
                            WHEN sources.version = excluded.version THEN sources.indexed_version
                            ELSE NULL
                        END,
                        version = excluded.version
                    ",
                )
                .map_err(|error| format!("Could not prepare the source index: {error}"))?;

            for source in sources {
                let people = serde_json::to_string(&source.people)
                    .map_err(|error| format!("Could not serialize source people: {error}"))?;
                statement
                    .execute(params![
                        source.id,
                        source.kind,
                        source.title,
                        source.location,
                        source.modified,
                        source.hash,
                        people,
                    ])
                    .map_err(|error| format!("Could not update the source index: {error}"))?;
            }
            // A changed source must not keep vectors from the old version.
            transaction
                .execute(
                    "DELETE FROM chunks WHERE source_id IN (SELECT id FROM sources WHERE indexed_version IS NULL)",
                    [],
                )
                .map_err(|error| format!("Could not clear stale embeddings: {error}"))?;
        }
        transaction
            .commit()
            .map_err(|error| format!("Could not save the source index: {error}"))
    }

    pub fn needs_index(&self, source: &SourceRef) -> Result<bool, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "The metadata index lock was poisoned.".to_string())?;
        let mut statement = connection
            .prepare(
                "SELECT indexed_version, (SELECT COUNT(*) FROM chunks WHERE source_id = sources.id) FROM sources WHERE id = ?1",
            )
            .map_err(|error| format!("Could not prepare the index check: {error}"))?;
        let result = statement
            .query_row([&source.id], |row| {
                let indexed: Option<String> = row.get(0)?;
                let chunks: i64 = row.get(1)?;
                Ok(indexed.as_deref() == Some(source.hash.as_str()) && chunks > 0)
            })
            .unwrap_or(false);
        Ok(!result)
    }

    pub fn replace_chunks(
        &self,
        source: &SourceRef,
        chunks: &[Chunk],
        embeddings: &[Vec<f32>],
    ) -> Result<(), String> {
        if chunks.len() != embeddings.len() {
            return Err("The chunk and embedding counts do not match.".into());
        }
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| "The metadata index lock was poisoned.".to_string())?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("Could not start the embedding transaction: {error}"))?;
        transaction
            .execute("DELETE FROM chunks WHERE source_id = ?1", [&source.id])
            .map_err(|error| format!("Could not clear old chunks: {error}"))?;
        {
            let mut statement = transaction
                .prepare(
                    "INSERT INTO chunks (source_id, chunk_index, location, embedding, model) VALUES (?1, ?2, ?3, ?4, ?5)",
                )
                .map_err(|error| format!("Could not prepare chunk storage: {error}"))?;
            for (index, (chunk, embedding)) in chunks.iter().zip(embeddings).enumerate() {
                statement
                    .execute(params![
                        source.id,
                        index as i64,
                        chunk.location,
                        encode_embedding(embedding),
                        EMBEDDING_MODEL,
                    ])
                    .map_err(|error| format!("Could not store a chunk embedding: {error}"))?;
            }
        }
        transaction
            .execute(
                "UPDATE sources SET indexed_version = ?1, indexed_at = ?2 WHERE id = ?3",
                params![source.hash, chrono::Utc::now().to_rfc3339(), source.id],
            )
            .map_err(|error| format!("Could not mark the source as indexed: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("Could not save chunk embeddings: {error}"))
    }

    pub fn search_embeddings(&self, query: &[f32], limit: usize) -> Result<Vec<IndexHit>, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "The metadata index lock was poisoned.".to_string())?;
        let mut statement = connection
            .prepare(
                "
                SELECT c.source_id, c.chunk_index, c.embedding
                FROM chunks c
                JOIN sources s ON s.id = c.source_id
                WHERE s.indexed_version IS NOT NULL
                ",
            )
            .map_err(|error| format!("Could not prepare the embedding search: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                let source_id: String = row.get(0)?;
                let chunk_index: i64 = row.get(1)?;
                let bytes: Vec<u8> = row.get(2)?;
                Ok((source_id, chunk_index, bytes))
            })
            .map_err(|error| format!("Could not read the embedding index: {error}"))?;

        let mut hits = Vec::new();
        for row in rows {
            let (source_id, chunk_index, bytes) =
                row.map_err(|error| format!("Could not read an embedding row: {error}"))?;
            let embedding = decode_embedding(&bytes)?;
            if embedding.len() != query.len() {
                continue;
            }
            let score = embedding
                .iter()
                .zip(query)
                .map(|(left, right)| left * right)
                .sum::<f32>();
            if score < MIN_SIMILARITY {
                continue;
            }
            hits.push(IndexHit {
                source_id,
                chunk_index: chunk_index.max(0) as usize,
                score,
            });
        }

        hits.sort_by(|left, right| {
            right
                .score
                .partial_cmp(&left.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        hits.truncate(limit);
        Ok(hits)
    }

    pub fn search_keywords(&self, query: &str, limit: usize) -> Result<Vec<KeywordHit>, String> {
        let lower = query.to_lowercase();
        let tokens = lower
            .split(|character: char| !character.is_alphanumeric())
            .filter(|token| token.len() > 2)
            .collect::<Vec<_>>();
        if tokens.is_empty() {
            return Ok(Vec::new());
        }

        let connection = self
            .connection
            .lock()
            .map_err(|_| "The metadata index lock was poisoned.".to_string())?;
        let mut statement = connection
            .prepare("SELECT id, title, location, people FROM sources")
            .map_err(|error| format!("Could not prepare the keyword search: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|error| format!("Could not read the metadata index: {error}"))?;

        let mut hits = Vec::new();
        for row in rows {
            let (source_id, title, location, people) =
                row.map_err(|error| format!("Could not read a metadata row: {error}"))?;
            let title = title.to_lowercase();
            let location = location.to_lowercase();
            let people = people.to_lowercase();
            let mut score = 0.0;
            for token in &tokens {
                if title.contains(token) {
                    score += 4.0;
                }
                if location.contains(token) {
                    score += 2.0;
                }
                if people.contains(token) {
                    score += 1.0;
                }
            }
            if score > 0.0 {
                hits.push(KeywordHit { source_id, score });
            }
        }
        hits.sort_by(|left, right| {
            right
                .score
                .partial_cmp(&left.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        hits.truncate(limit);
        Ok(hits)
    }

    pub fn status(&self) -> Result<IndexStatus, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "The metadata index lock was poisoned.".to_string())?;
        let sources: i64 = connection
            .query_row("SELECT COUNT(*) FROM sources", [], |row| row.get(0))
            .unwrap_or(0);
        let indexed_sources: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sources WHERE indexed_version IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let chunks: i64 = connection
            .query_row("SELECT COUNT(*) FROM chunks", [], |row| row.get(0))
            .unwrap_or(0);
        Ok(IndexStatus {
            sources: sources.max(0) as u64,
            indexed_sources: indexed_sources.max(0) as u64,
            chunks: chunks.max(0) as u64,
            model: EMBEDDING_MODEL.into(),
        })
    }

    pub fn clear(&self) -> Result<(), String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "The metadata index lock was poisoned.".to_string())?;
        connection
            .execute_batch(
                "DELETE FROM chunks; UPDATE sources SET indexed_version = NULL, indexed_at = NULL;",
            )
            .map_err(|error| format!("Could not clear the semantic index: {error}"))
    }
}

fn encode_embedding(embedding: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(embedding.len() * 4);
    for value in embedding {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn decode_embedding(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if !bytes.len().is_multiple_of(4) {
        return Err("A stored embedding is malformed.".into());
    }
    Ok(bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|chunk| f32::from_le_bytes(*chunk))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(id: &str) -> SourceRef {
        SourceRef {
            id: id.into(),
            grant_id: "test".into(),
            kind: "file".into(),
            title: "Onboarding".into(),
            location: "/tmp/onboarding.md".into(),
            modified: "2026-11-17T09:00:00Z".into(),
            hash: "v1".into(),
            people: Vec::new(),
        }
    }

    fn chunk(location: &str, text: &str) -> Chunk {
        Chunk {
            source_id: "file:onboarding".into(),
            source_type: "file".into(),
            title: "Onboarding".into(),
            location: location.into(),
            origin: "/tmp/onboarding.md".into(),
            timestamp: "2026-11-17T09:00:00Z".into(),
            text: text.into(),
        }
    }

    #[test]
    fn stores_and_searches_embeddings_without_chunk_text() {
        let dir = std::env::temp_dir().join(format!("frontdesk-index-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let index = IndexStore::open(&dir).unwrap();
        let source = source("file:onboarding");
        index.upsert_sources(std::slice::from_ref(&source)).unwrap();
        let chunks = vec![chunk("part 1", "Priya begins on Monday.")];
        let embeddings = vec![vec![1.0, 0.0, 0.0]];
        index.replace_chunks(&source, &chunks, &embeddings).unwrap();

        let hits = index.search_embeddings(&[1.0, 0.0, 0.0], 5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].source_id, "file:onboarding");
        assert!(!index.needs_index(&source).unwrap());

        let status = index.status().unwrap();
        assert_eq!(status.chunks, 1);
        index.clear().unwrap();
        assert_eq!(index.status().unwrap().chunks, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod semantic_threshold_tests {
    use super::*;
    use crate::embedding::Embedder;
    use std::path::PathBuf;

    #[test]
    fn optional_relevance_threshold_smoke() {
        let Some(dir) = std::env::var_os("FRONTDESK_TEST_EMBED_DIR") else {
            return;
        };
        let embedder = Embedder::new(PathBuf::from(dir));
        let vectors = embedder
            .embed(&[
                "Who is starting on Monday?".to_string(),
                "Priya begins her first day on Monday.".to_string(),
                "Attention weights in neural networks show how different parts of the model focus on various inputs. Queries ask questions, keys match answers and values provide information. If you are listing tasks for the upcoming week, start with who is starting on Monday.".to_string(),
            ])
            .expect("embedding smoke");
        let dot = |left: &[f32], right: &[f32]| -> f32 {
            left.iter().zip(right).map(|(a, b)| a * b).sum()
        };
        let relevant = dot(&vectors[0], &vectors[1]);
        let unrelated = dot(&vectors[0], &vectors[2]);
        eprintln!("relevant={relevant:.3} unrelated={unrelated:.3} threshold={MIN_SIMILARITY}");
        assert!(
            relevant > unrelated,
            "expected the onboarding text to rank above attention"
        );
    }
}
