use std::convert::Infallible;

use axum::extract::{Multipart, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::{Router, routing::post};
use futures::StreamExt;
use serde::Serialize;
use surrealdb::Surreal;
use surrealdb::engine::any::Any;
use surrealdb::types::RecordId;
use tokio_stream::wrappers::ReceiverStream;

use crate::ingest;
use crate::ingest::embed::EMBEDDING_DIM;
use crate::state::AppState;

use super::error::ApiError;

// ---------------------------------------------------------------------------
// OpenAPI schema (for docs only — actual extraction uses Multipart)
// ---------------------------------------------------------------------------

/// Multipart form fields for creating an upload.
#[derive(Debug, utoipa::ToSchema)]
pub struct CreateUploadRequest {
    /// Display name for the upload.
    pub name: String,
    /// Type of upload. Currently only "notion_export" is supported.
    pub upload_type: UploadType,
    /// The file to upload (.zip archive).
    #[schema(format = "binary")]
    pub file: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum UploadType {
    NotionExport,
}

// ---------------------------------------------------------------------------
// SSE event payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct UploadCreatedEvent {
    pub id: String,
    pub name: String,
    pub upload_type: UploadType,
    pub status: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ExtractingEvent {
    pub documents_found: usize,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct DocumentExtractedEvent {
    pub index: usize,
    pub source_path: String,
    pub content_type: String,
    pub content_length: usize,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ChunkingEvent {
    pub document_index: usize,
    pub source_path: String,
    pub chunks_created: usize,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct CompletedEvent {
    pub id: String,
    pub status: String,
    pub total_documents: usize,
    pub total_chunks: usize,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ErrorEvent {
    pub message: String,
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

#[utoipa::path(
    post,
    path = "/api/uploads",
    request_body(content = CreateUploadRequest, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "SSE stream of pipeline progress events"),
        (status = 400, description = "Bad request", body = super::error::ErrorResponse),
    ),
    tag = "uploads"
)]
pub async fn create_upload(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, ApiError> {
    // -- Parse multipart fields ------------------------------------------------
    let mut upload_type: Option<UploadType> = None;
    let mut name: Option<String> = None;
    let mut file_data: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::BadRequest(format!("invalid multipart: {e}")))?
    {
        match field.name() {
            Some("upload_type") => {
                let value = field
                    .text()
                    .await
                    .map_err(|e| ApiError::BadRequest(format!("failed to read upload_type: {e}")))?;
                upload_type = Some(match value.as_str() {
                    "notion_export" => UploadType::NotionExport,
                    other => {
                        return Err(ApiError::BadRequest(format!(
                            "unsupported upload_type: {other}"
                        )));
                    }
                });
            }
            Some("name") => {
                name = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| ApiError::BadRequest(format!("failed to read name: {e}")))?,
                );
            }
            Some("file") => {
                file_data = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| ApiError::BadRequest(format!("failed to read file: {e}")))?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }

    let upload_type =
        upload_type.ok_or_else(|| ApiError::BadRequest("missing field: upload_type".into()))?;
    let name = name.ok_or_else(|| ApiError::BadRequest("missing field: name".into()))?;
    let file_data =
        file_data.ok_or_else(|| ApiError::BadRequest("missing field: file".into()))?;

    // -- Spawn pipeline, stream events via channel -----------------------------
    let chunk_size = state.config.chunk_size;
    let db = state.db.clone();

    let (tx, rx) = tokio::sync::mpsc::channel::<Event>(64);

    tokio::spawn(async move {
        if let Err(e) =
            process_upload(tx.clone(), db, name, upload_type, file_data, chunk_size).await
        {
            let _ = tx
                .send(sse_event(
                    "error",
                    &ErrorEvent {
                        message: e.to_string(),
                    },
                ))
                .await;
        }
    });

    let stream = ReceiverStream::new(rx).map(Ok::<_, Infallible>);
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
enum PipelineError {
    #[error("extraction failed: {0}")]
    Extract(#[from] ingest::ExtractError),
    #[error("database error: {0}")]
    Db(#[from] surrealdb::Error),
    #[error("failed to send SSE event")]
    Send,
}

/// Helper — send an event or return PipelineError::Send.
async fn emit(
    tx: &tokio::sync::mpsc::Sender<Event>,
    event_type: &str,
    data: &impl Serialize,
) -> Result<(), PipelineError> {
    tx.send(sse_event(event_type, data))
        .await
        .map_err(|_| PipelineError::Send)
}

/// Run the full ingest pipeline, sending SSE events in real time.
async fn process_upload(
    tx: tokio::sync::mpsc::Sender<Event>,
    db: Surreal<Any>,
    name: String,
    upload_type: UploadType,
    file_data: Vec<u8>,
    chunk_size: usize,
) -> Result<(), PipelineError> {
    // -- Create upload record in DB --------------------------------------------
    let upload_type_str = match upload_type {
        UploadType::NotionExport => "notion_export",
    };

    let mut result = db
        .query("CREATE uploads SET name = $name, upload_type = $type, status = 'processing' RETURN id")
        .bind(("name", name.clone()))
        .bind(("type", upload_type_str.to_string()))
        .await?;

    let upload_id: Option<RecordId> = result.take("id")?;
    let upload_id = upload_id
        .ok_or_else(|| surrealdb::Error::internal("failed to create upload record".into()))?;

    emit(
        &tx,
        "upload_created",
        &UploadCreatedEvent {
            id: format!("{}:{:?}", upload_id.table, upload_id.key),
            name,
            upload_type,
            status: "processing".into(),
        },
    )
    .await?;

    // -- Extract documents -----------------------------------------------------
    let documents = match upload_type_str {
        "notion_export" => ingest::notion::extract_from_zip(&file_data)?,
        _ => unreachable!(),
    };

    emit(
        &tx,
        "extracting",
        &ExtractingEvent {
            documents_found: documents.len(),
        },
    )
    .await?;

    // -- Process each document: persist + chunk + persist chunks ----------------
    let zero_embedding: Vec<f64> = vec![0.0; EMBEDDING_DIM];
    let mut total_chunks: usize = 0;

    for (i, doc) in documents.iter().enumerate() {
        emit(
            &tx,
            "document_extracted",
            &DocumentExtractedEvent {
                index: i,
                source_path: doc.source_path.clone(),
                content_type: doc.content_type.as_str().into(),
                content_length: doc.content.len(),
            },
        )
        .await?;

        // Persist the document
        let mut doc_result = db
            .query(
                "CREATE documents SET \
                    upload = $upload, \
                    content = $content, \
                    content_type = $content_type, \
                    source_path = $source_path, \
                    origin_url = $origin_url \
                    RETURN id",
            )
            .bind(("upload", upload_id.clone()))
            .bind(("content", doc.content.clone()))
            .bind(("content_type", doc.content_type.as_str().to_string()))
            .bind(("source_path", doc.source_path.clone()))
            .bind(("origin_url", doc.origin_url.clone()))
            .await?;

        let doc_id: Option<RecordId> = doc_result.take("id")?;
        let doc_id = doc_id
            .ok_or_else(|| surrealdb::Error::internal("failed to create document record".into()))?;

        // Chunk the document
        let chunks = ingest::chunk::split_document(&doc.content, doc.content_type, chunk_size);

        // Persist each chunk with a zero-vector embedding
        for chunk in &chunks {
            db.query(
                "CREATE chunks SET \
                    document = $document, \
                    upload = $upload, \
                    content = $content, \
                    chunk_index = $chunk_index, \
                    char_offset = $char_offset, \
                    char_length = $char_length, \
                    embedding = $embedding, \
                    embedding_model = 'none'",
            )
            .bind(("document", doc_id.clone()))
            .bind(("upload", upload_id.clone()))
            .bind(("content", chunk.content.clone()))
            .bind(("chunk_index", chunk.chunk_index as i64))
            .bind(("char_offset", chunk.char_offset as i64))
            .bind(("char_length", chunk.char_length as i64))
            .bind(("embedding", zero_embedding.clone()))
            .await?;
        }

        emit(
            &tx,
            "chunking",
            &ChunkingEvent {
                document_index: i,
                source_path: doc.source_path.clone(),
                chunks_created: chunks.len(),
            },
        )
        .await?;

        total_chunks += chunks.len();
    }

    // -- Mark upload complete ---------------------------------------------------
    db.query("UPDATE $upload_id SET status = 'completed', updated_at = time::now()")
        .bind(("upload_id", upload_id.clone()))
        .await?;

    emit(
        &tx,
        "completed",
        &CompletedEvent {
            id: format!("{}:{:?}", upload_id.table, upload_id.key),
            status: "completed".into(),
            total_documents: documents.len(),
            total_chunks,
        },
    )
    .await?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn sse_event(event_type: &str, data: &impl Serialize) -> Event {
    Event::default()
        .event(event_type)
        .json_data(data)
        .expect("failed to serialize SSE event")
}

/// 500 MB request body limit for uploads.
const MAX_UPLOAD_SIZE: usize = 500 * 1024 * 1024;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/uploads",
        post(create_upload).layer(axum::extract::DefaultBodyLimit::max(MAX_UPLOAD_SIZE)),
    )
}
