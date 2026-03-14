use thiserror::Error;

/// Default embedding model to use with Voyage AI.
pub const DEFAULT_MODEL: &str = "voyage-3-large";

/// Dimension of the embedding vectors (must match the HNSW index in the DB schema).
pub const EMBEDDING_DIM: usize = 1024;

#[derive(Debug, Error)]
pub enum EmbedError {
    #[error("Voyage API key not configured (set AZOR_VOYAGE_API_KEY)")]
    MissingApiKey,
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Voyage API error: {message}")]
    Api { message: String },
    #[error("Unexpected response shape from Voyage API")]
    BadResponse,
}

/// Embed a batch of text chunks using the Voyage AI API.
///
/// Returns a vector of embeddings, one per input chunk, in the same order.
/// Each embedding is a `Vec<f32>` of length `EMBEDDING_DIM`.
pub async fn embed_batch(
    _api_key: &str,
    _texts: &[&str],
    _model: &str,
) -> Result<Vec<Vec<f32>>, EmbedError> {
    todo!("call Voyage AI /v1/embeddings endpoint")
}
