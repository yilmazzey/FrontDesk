use std::path::PathBuf;
use std::sync::Mutex;

use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};

/// Local sentence embeddings for candidate selection. The model is downloaded
/// once into the app-data folder and stays on the machine.
pub struct Embedder {
    cache_dir: PathBuf,
    model: Mutex<Option<TextEmbedding>>,
}

impl Embedder {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            model: Mutex::new(None),
        }
    }

    pub fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let mut guard = self
            .model
            .lock()
            .map_err(|_| "The embedding model lock was poisoned.".to_string())?;
        if guard.is_none() {
            let options = TextInitOptions::new(EmbeddingModel::AllMiniLML6V2)
                .with_cache_dir(self.cache_dir.clone())
                .with_show_download_progress(false)
                .with_max_length(256);
            let model = TextEmbedding::try_new(options)
                .map_err(|error| format!("Could not load the local embedding model: {error}"))?;
            *guard = Some(model);
        }

        guard
            .as_mut()
            .expect("embedding model was just initialized")
            .embed(texts, Some(32))
            .map_err(|error| format!("Could not compute local embeddings: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Opt-in smoke test: set FRONTDESK_TEST_EMBED_DIR to a writable folder.
    #[test]
    fn optional_embedding_smoke() {
        let Some(dir) = std::env::var_os("FRONTDESK_TEST_EMBED_DIR") else {
            return;
        };
        let embedder = Embedder::new(PathBuf::from(dir));
        let vectors = embedder
            .embed(&[
                "Priya starts on Monday".to_string(),
                "Attention weights in neural networks".to_string(),
            ])
            .expect("embedding model should run");
        assert_eq!(vectors.len(), 2);
        assert!(!vectors[0].is_empty());
        assert_eq!(vectors[0].len(), vectors[1].len());
    }
}
