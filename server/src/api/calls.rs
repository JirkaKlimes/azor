// TODO: This endpoint accepts a canned transcript for testing the RAG pipeline.
// It will be replaced by a WebSocket endpoint that streams live audio transcription.

use std::convert::Infallible;
use std::fmt::Write;

use axum::extract::State;
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::{Json, Router, routing::post};
use futures::StreamExt;
use llm::builder::{LLMBackend, LLMBuilder};
use llm::chat::ChatMessage;
use serde::{Deserialize, Serialize};
use surrealdb::types::{RecordId, SurrealValue};
use tokio_stream::wrappers::ReceiverStream;

use crate::ingest::embed;
use crate::state::AppState;

use super::error::ApiError;

const SYSTEM_PROMPT: &str = "\
You are an AI copilot assisting a call center operator in real time. \
Given the conversation so far and relevant knowledge base excerpts, \
provide a concise suggested response or key information the operator should know. \
Be direct and actionable.";

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CreateCallRequest {
    pub messages: Vec<CallMessage>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CallMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ConversationCreatedEvent {
    pub id: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct MessageAddedEvent {
    pub id: String,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct RetrievedChunk {
    pub content: String,
    pub source_path: Option<String>,
    pub score: f64,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct ChunksRetrievedEvent {
    pub message_id: String,
    pub chunks: Vec<RetrievedChunk>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct SuggestionEvent {
    pub message_id: String,
    pub content: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct CallCompletedEvent {
    pub conversation_id: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct CallErrorEvent {
    pub message: String,
}

#[utoipa::path(
    post,
    path = "/api/calls",
    request_body = CreateCallRequest,
    responses(
        (status = 200, description = "SSE stream of call processing events"),
        (status = 400, description = "Bad request", body = super::error::ErrorResponse),
    ),
    tag = "calls"
)]
pub async fn create_call(
    State(state): State<AppState>,
    Json(body): Json<CreateCallRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if body.messages.is_empty() {
        return Err(ApiError::BadRequest("messages must not be empty".into()));
    }

    for msg in &body.messages {
        if msg.role != "customer" && msg.role != "operator" {
            return Err(ApiError::BadRequest(format!(
                "invalid role '{}', must be 'customer' or 'operator'",
                msg.role
            )));
        }
    }

    let (tx, rx) = tokio::sync::mpsc::channel::<Event>(64);

    tokio::spawn(async move {
        if let Err(e) = process_call(tx.clone(), state, body.messages).await {
            let _ = tx
                .send(sse_event(
                    "error",
                    &CallErrorEvent {
                        message: e.to_string(),
                    },
                ))
                .await;
        }
    });

    let stream = ReceiverStream::new(rx).map(Ok::<_, Infallible>);
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

#[derive(Debug, thiserror::Error)]
enum PipelineError {
    #[error("embedding failed: {0}")]
    Embed(#[from] embed::EmbedError),
    #[error("database error: {0}")]
    Db(#[from] surrealdb::Error),
    #[error("LLM error: {0}")]
    Llm(String),
    #[error("failed to send SSE event")]
    Send,
}

async fn emit(
    tx: &tokio::sync::mpsc::Sender<Event>,
    event_type: &str,
    data: &impl Serialize,
) -> Result<(), PipelineError> {
    tx.send(sse_event(event_type, data))
        .await
        .map_err(|_| PipelineError::Send)
}

#[derive(Debug, SurrealValue)]
struct ChunkMatch {
    content: String,
    source_path: Option<String>,
    score: f64,
}

async fn process_call(
    tx: tokio::sync::mpsc::Sender<Event>,
    state: AppState,
    messages: Vec<CallMessage>,
) -> Result<(), PipelineError> {
    let llm = LLMBuilder::new()
        .backend(LLMBackend::OpenRouter)
        .api_key(&state.config.openrouter_api_key)
        .model(&state.config.llm_model)
        .max_tokens(4096)
        .temperature(0.1)
        .system(SYSTEM_PROMPT)
        .build()
        .map_err(|e| PipelineError::Llm(e.to_string()))?;

    let mut result = state
        .db
        .query("CREATE conversations SET status = 'active' RETURN id")
        .await?;

    let conversation_id: Option<RecordId> = result.take("id")?;
    let conversation_id = conversation_id
        .ok_or_else(|| surrealdb::Error::internal("failed to create conversation".into()))?;

    let conv_id_str = format!("{}:{:?}", conversation_id.table, conversation_id.key);

    emit(
        &tx,
        "conversation_created",
        &ConversationCreatedEvent {
            id: conv_id_str.clone(),
        },
    )
    .await?;

    let mut conversation_history: Vec<(String, String)> = Vec::new();

    for msg in &messages {
        let mut msg_result = state
            .db
            .query(
                "CREATE messages SET \
                    conversation = $conversation, \
                    role = $role, \
                    content = $content \
                    RETURN id",
            )
            .bind(("conversation", conversation_id.clone()))
            .bind(("role", msg.role.clone()))
            .bind(("content", msg.content.clone()))
            .await?;

        let message_id: Option<RecordId> = msg_result.take("id")?;
        let message_id = message_id
            .ok_or_else(|| surrealdb::Error::internal("failed to create message".into()))?;
        let msg_id_str = format!("{}:{:?}", message_id.table, message_id.key);

        emit(
            &tx,
            "message_added",
            &MessageAddedEvent {
                id: msg_id_str.clone(),
                role: msg.role.clone(),
                content: msg.content.clone(),
            },
        )
        .await?;

        conversation_history.push((msg.role.clone(), msg.content.clone()));

        let embedding =
            embed::embed_batch(&state, &[msg.content.as_str()], embed::InputType::Query).await?;
        let query_embedding: Vec<f64> = embedding
            .into_iter()
            .next()
            .unwrap_or_default()
            .into_iter()
            .map(f64::from)
            .collect();

        let mut search_result = state
            .db
            .query(
                "SELECT \
                    content, \
                    document.source_path AS source_path, \
                    vector::similarity::cosine(embedding, $emb) AS score \
                FROM chunks \
                WHERE embedding <|10,40|> $emb \
                ORDER BY score DESC \
                LIMIT 5",
            )
            .bind(("emb", query_embedding))
            .await?;

        let matches: Vec<ChunkMatch> = search_result.take(0)?;

        let retrieved: Vec<RetrievedChunk> = matches
            .into_iter()
            .map(|m| RetrievedChunk {
                content: m.content,
                source_path: m.source_path,
                score: m.score,
            })
            .collect();

        emit(
            &tx,
            "chunks_retrieved",
            &ChunksRetrievedEvent {
                message_id: msg_id_str.clone(),
                chunks: retrieved.clone(),
            },
        )
        .await?;

        let mut prompt = String::new();

        writeln!(prompt, "## Conversation so far").unwrap();
        for (role, content) in &conversation_history {
            writeln!(prompt, "[{role}]: {content}").unwrap();
        }

        if !retrieved.is_empty() {
            writeln!(prompt, "\n## Relevant knowledge base excerpts").unwrap();
            for (i, chunk) in retrieved.iter().enumerate() {
                let source = chunk.source_path.as_deref().unwrap_or("unknown");
                writeln!(
                    prompt,
                    "### Excerpt {} (source: {}, relevance: {:.3})\n{}",
                    i + 1,
                    source,
                    chunk.score,
                    chunk.content
                )
                .unwrap();
            }
        }

        writeln!(
            prompt,
            "\n## Task\nProvide a suggested response or key information for the operator."
        )
        .unwrap();

        let chat_messages = vec![ChatMessage::user().content(prompt).build()];
        let response = llm
            .chat(&chat_messages)
            .await
            .map_err(|e| PipelineError::Llm(e.to_string()))?;

        let suggestion_text = response.text().unwrap_or_default();

        emit(
            &tx,
            "suggestion",
            &SuggestionEvent {
                message_id: msg_id_str,
                content: suggestion_text,
            },
        )
        .await?;
    }

    state
        .db
        .query("UPDATE $conv SET status = 'completed', updated_at = time::now()")
        .bind(("conv", conversation_id))
        .await?;

    emit(
        &tx,
        "completed",
        &CallCompletedEvent {
            conversation_id: conv_id_str,
        },
    )
    .await?;

    Ok(())
}

fn sse_event(event_type: &str, data: &impl Serialize) -> Event {
    Event::default()
        .event(event_type)
        .json_data(data)
        .expect("failed to serialize SSE event")
}

pub fn router() -> Router<AppState> {
    Router::new().route("/calls", post(create_call))
}
