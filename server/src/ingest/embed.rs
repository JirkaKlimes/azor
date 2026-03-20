use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::state::AppState;

/// Default embedding model to use with Voyage AI.
pub const DEFAULT_MODEL: &str = "voyage-3-large";

/// Maximum number of texts per Voyage AI API request.
const BATCH_SIZE: usize = 128;

const VOYAGE_API_URL: &str = "https://ai.mongodb.com/v1/embeddings";

#[derive(Debug, Error)]
pub enum EmbedError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Voyage API error: {message}")]
    Api { message: String },
    #[error("Unexpected response shape from Voyage API")]
    BadResponse,
}

/// Specifies how the input texts should be optimized for embedding.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InputType {
    /// For texts being indexed/stored (e.g. knowledge base chunks).
    Document,
    /// For texts used as search queries.
    Query,
}

#[derive(Serialize)]
struct EmbedRequest<'a> {
    input: &'a [&'a str],
    model: &'a str,
    input_type: InputType,
}

#[derive(Deserialize)]
struct EmbedResponse {
    data: Option<Vec<EmbedData>>,
    detail: Option<String>,
}

#[derive(Deserialize)]
struct EmbedData {
    embedding: Vec<f32>,
    index: usize,
}

/// Embed a batch of text chunks using the Voyage AI API (via MongoDB Atlas).
///
/// Accepts any number of input texts — internally splits into sub-batches of 128
/// (Voyage AI's per-request limit) and makes multiple requests as needed.
///
/// `input_type` should be [`InputType::Document`] when indexing content and
/// [`InputType::Query`] when embedding search queries.
///
/// Returns a vector of embeddings, one per input text, in the same order.
/// Each embedding is a `Vec<f32>` of length 1024 (for `voyage-3-large`).
pub async fn embed_batch(
    state: &AppState,
    texts: &[&str],
    input_type: InputType,
) -> Result<Vec<Vec<f32>>, EmbedError> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    let mut all_embeddings: Vec<Vec<f32>> = Vec::with_capacity(texts.len());

    for batch in texts.chunks(BATCH_SIZE) {
        let body = EmbedRequest {
            input: batch,
            model: DEFAULT_MODEL,
            input_type,
        };

        let resp = state
            .http
            .post(VOYAGE_API_URL)
            .bearer_auth(&state.config.voyage_api_key)
            .json(&body)
            .send()
            .await?
            .error_for_status()?;

        let parsed: EmbedResponse = resp.json().await?;

        if let Some(detail) = parsed.detail {
            return Err(EmbedError::Api { message: detail });
        }

        let mut data = parsed.data.ok_or(EmbedError::BadResponse)?;

        if data.len() != batch.len() {
            return Err(EmbedError::BadResponse);
        }

        data.sort_by_key(|d| d.index);
        all_embeddings.extend(data.into_iter().map(|d| d.embedding));
    }

    Ok(all_embeddings)
}
