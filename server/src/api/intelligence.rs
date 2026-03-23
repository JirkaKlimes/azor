use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
};
use serde::Serialize;

use super::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct DocumentResponse {
    pub id: String,
    pub content: String,
    pub source_path: Option<String>,
    pub origin_url: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/documents/{id}",
    params(
        ("id" = String, Path, description = "Document ID (e.g., 'documents:abc123')")
    ),
    responses(
        (status = 200, description = "Document content", body = DocumentResponse),
        (status = 404, description = "Document not found"),
    ),
    tag = "intelligence"
)]
pub async fn get_document(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<DocumentResponse>, ApiError> {
    let doc_id = id.split(':').last().unwrap_or(&id).to_string();

    let row: Option<serde_json::Value> = state
        .db
        .query("SELECT * FROM documents WHERE id.id() = $id")
        .bind(("id", doc_id))
        .await?
        .take(0)?;

    let row = row.ok_or_else(|| ApiError::NotFound(format!("document not found: {id}")))?;

    Ok(Json(DocumentResponse {
        id,
        content: row["content"].as_str().unwrap_or_default().to_string(),
        source_path: row["source_path"].as_str().map(String::from),
        origin_url: row["origin_url"].as_str().map(String::from),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/documents/{id}", get(get_document))
}
