// TODO: This endpoint simulates a call with canned messages for testing the RAG + intelligence pipeline.
// It will be replaced by a WebSocket endpoint that streams live audio transcription.

use std::fmt::Write;

use axum::extract::State;
use axum::{Json, Router, routing::post};
use documented::Documented;
use llm::builder::{FunctionBuilder, LLMBackend, LLMBuilder};
use llm::chat::{ChatMessage, ToolChoice};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use surrealdb::types::{RecordId, SurrealValue};

use crate::ingest::embed;
use crate::state::AppState;

use super::error::ApiError;

const SYSTEM_PROMPT: &str = "\
You are an AI copilot assisting a call center operator in real time. \
You are given the conversation so far and relevant knowledge base excerpts. \
Analyze the excerpts and use the provided tools to produce your analysis. \
You MUST call at least one tool.\n\n\
Tool usage guidelines:\n\
- Use `highlight` to quote a specific, directly relevant passage from an excerpt. \
  Include surrounding context (pre/post) so the passage can be precisely located in the source.\n\
- Use `summary` to provide a synthesized overview of what the knowledge base says about the topic.\n\
- Use `suggest` to draft a response the operator can say to the customer.\n\
- Use `no_answer` if the excerpts do not contain information relevant to the customer's question. \
  Explain what was missing.\n\n\
You may call multiple tools in a single response. A typical good response would include \
one or more highlights, a summary, and a suggestion. Only use `no_answer` when the excerpts \
truly lack relevant information.";

/// Trait for LLM tool structs that can self-describe as `FunctionBuilder` and
/// convert themselves into intelligence data for storage.
trait CallTool: JsonSchema + Documented + Serialize {
    /// The intelligence `kind` stored in the database (e.g. "highlight", "summary").
    const KIND: &'static str;

    /// Derive a `FunctionBuilder` from the struct's JSON Schema and doc comment.
    fn function_builder() -> FunctionBuilder {
        let name = {
            let full = std::any::type_name::<Self>();
            full.split("::").last().unwrap_or(full)
        };
        // schemars schema_for! returns a full JSON Schema with description, properties, etc.
        let schema = serde_json::to_value(schemars::schema_for!(Self))
            .expect("schema serialization cannot fail");
        FunctionBuilder::new(name)
            .description(Self::DOCS)
            .json_schema(schema)
    }

    /// Convert the deserialized tool call into JSON data for the intelligence record.
    fn into_data(self) -> Value;
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
/// Quote a specific, directly relevant passage from a knowledge base excerpt.
/// Include surrounding context so the passage can be precisely located via search.
#[serde(rename = "highlight")]
struct Highlight {
    /// Text immediately before the highlighted passage, for anchoring context
    pre: String,
    /// The exact highlighted passage from the excerpt
    text: String,
    /// Text immediately after the highlighted passage, for anchoring context
    post: String,
    /// The source path of the excerpt
    source_path: String,
}

impl CallTool for Highlight {
    const KIND: &'static str = "highlight";

    fn into_data(self) -> Value {
        serde_json::to_value(self).expect("Highlight serialization cannot fail")
    }
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
/// Provide a synthesized overview of what the knowledge base says about the topic.
#[serde(rename = "summary")]
struct Summary {
    /// The summary text
    text: String,
}

impl CallTool for Summary {
    const KIND: &'static str = "summary";

    fn into_data(self) -> Value {
        serde_json::to_value(self).expect("Summary serialization cannot fail")
    }
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
/// Draft a response the operator can say or adapt for the customer.
#[serde(rename = "suggest")]
struct Suggest {
    /// The suggested response text
    text: String,
}

impl CallTool for Suggest {
    const KIND: &'static str = "suggestion";

    fn into_data(self) -> Value {
        serde_json::to_value(self).expect("Suggest serialization cannot fail")
    }
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
/// Signal that the knowledge base excerpts do not contain information
/// relevant to the customer's question.
#[serde(rename = "no_answer")]
struct NoAnswer {
    /// Why the excerpts are not relevant
    reason: String,
}

impl CallTool for NoAnswer {
    const KIND: &'static str = "summary";

    fn into_data(self) -> Value {
        serde_json::json!({ "text": self.reason })
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CreateCallRequest {
    pub messages: Vec<CallMessage>,
}

#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct CallMessage {
    pub role: String,
    pub content: String,
    pub wait: Option<f64>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct CreateCallResponse {
    pub conversation_id: String,
}

#[utoipa::path(
    post,
    path = "/api/calls",
    request_body = CreateCallRequest,
    responses(
        (status = 200, description = "Call processed, intelligence records created", body = CreateCallResponse),
        (status = 400, description = "Bad request", body = super::error::ErrorResponse),
    ),
    tag = "calls"
)]
pub async fn create_call(
    State(state): State<AppState>,
    Json(body): Json<CreateCallRequest>,
) -> Result<Json<CreateCallResponse>, ApiError> {
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

    let conversation_id = create_conversation(&state).await?;
    let conv_id_str = format_record_id(&conversation_id);

    let llm = build_llm(&state).map_err(|e| ApiError::Internal(e.to_string()))?;

    let mut history: Vec<CallMessage> = Vec::new();

    for msg in &body.messages {
        if let Some(wait) = msg.wait {
            if wait > 0.0 {
                tokio::time::sleep(tokio::time::Duration::from_secs_f64(wait)).await;
            }
        }

        let message_id = persist_message(&state, &conversation_id, msg).await?;
        history.push(msg.clone());

        let chunks = retrieve_chunks(&state, &conversation_id, &message_id, &msg.content).await?;

        if chunks.is_empty() {
            create_intelligence(
                &state,
                &conversation_id,
                Some(&message_id),
                "summary",
                serde_json::json!({ "text": "No relevant knowledge base excerpts found." }),
            )
            .await?;
            continue;
        }

        let prompt = build_prompt(&history, &chunks);
        let chat_messages = vec![ChatMessage::user().content(prompt).build()];
        let response = llm
            .chat_with_tools(&chat_messages, llm.tools())
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;

        if let Some(tool_calls) = response.tool_calls() {
            process_tool_calls(&state, &conversation_id, &message_id, &tool_calls).await?;
        } else if let Some(text) = response.text() {
            tracing::warn!("LLM returned text instead of tool calls, storing as summary");
            create_intelligence(
                &state,
                &conversation_id,
                Some(&message_id),
                "summary",
                serde_json::json!({ "text": text }),
            )
            .await?;
        }
    }

    complete_conversation(&state, &conversation_id).await?;

    Ok(Json(CreateCallResponse {
        conversation_id: conv_id_str,
    }))
}

fn build_llm(state: &AppState) -> Result<Box<dyn llm::LLMProvider>, llm::error::LLMError> {
    LLMBuilder::new()
        .backend(LLMBackend::OpenRouter)
        .api_key(&state.config.openrouter_api_key)
        .model(&state.config.llm_model)
        .extra_body(serde_json::json!({"provider": {"sort": "throughput"}}))
        .max_tokens(4096)
        .temperature(0.1)
        .system(SYSTEM_PROMPT)
        .function(Highlight::function_builder())
        .function(Summary::function_builder())
        .function(Suggest::function_builder())
        .function(NoAnswer::function_builder())
        .tool_choice(ToolChoice::Any)
        .enable_parallel_tool_use(true)
        .build()
}

#[derive(Debug, SurrealValue)]
struct ChunkMatch {
    id: RecordId,
    content: String,
    source_path: Option<String>,
    score: f64,
}

async fn retrieve_chunks(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: &RecordId,
    content: &str,
) -> Result<Vec<ChunkMatch>, ApiError> {
    let embeddings = embed::embed_batch(state, &[content], embed::InputType::Query)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    let query_embedding: Vec<f64> = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| ApiError::Internal("embedding returned no vectors".into()))?
        .into_iter()
        .map(f64::from)
        .collect();

    let mut search_result = state
        .db
        .query(
            "SELECT \
                id, \
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

    for chunk in &matches {
        create_intelligence(
            state,
            conversation_id,
            Some(message_id),
            "retrieval",
            serde_json::json!({
                "chunk": format_record_id(&chunk.id),
                "score": chunk.score,
            }),
        )
        .await?;
    }

    Ok(matches)
}

fn build_prompt(history: &[CallMessage], chunks: &[ChunkMatch]) -> String {
    let mut prompt = String::new();

    writeln!(prompt, "## Conversation so far").unwrap();
    for msg in history {
        writeln!(prompt, "[{}]: {}", msg.role, msg.content).unwrap();
    }

    writeln!(prompt, "\n## Relevant knowledge base excerpts").unwrap();
    for (i, chunk) in chunks.iter().enumerate() {
        let source = chunk.source_path.as_deref().unwrap_or("unknown");
        writeln!(
            prompt,
            "### Excerpt {} (source: {})\n{}",
            i + 1,
            source,
            chunk.content
        )
        .unwrap();
    }

    prompt
}

async fn process_tool_calls(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: &RecordId,
    tool_calls: &[llm::ToolCall],
) -> Result<(), ApiError> {
    for call in tool_calls {
        let args = &call.function.arguments;
        let name = call.function.name.as_str();

        match name {
            "Highlight" | "highlight" => {
                dispatch_tool::<Highlight>(state, conversation_id, message_id, args).await?
            }
            "Summary" | "summary" => {
                dispatch_tool::<Summary>(state, conversation_id, message_id, args).await?
            }
            "Suggest" | "suggest" => {
                dispatch_tool::<Suggest>(state, conversation_id, message_id, args).await?
            }
            "NoAnswer" | "no_answer" => {
                dispatch_tool::<NoAnswer>(state, conversation_id, message_id, args).await?
            }
            other => {
                tracing::warn!(tool = other, "LLM called unknown tool, skipping");
            }
        }
    }

    Ok(())
}

async fn dispatch_tool<T: CallTool + serde::de::DeserializeOwned>(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: &RecordId,
    args: &str,
) -> Result<(), ApiError> {
    let tool: T = serde_json::from_str(args)
        .map_err(|e| ApiError::Internal(format!("failed to parse tool args: {e}")))?;
    create_intelligence(
        state,
        conversation_id,
        Some(message_id),
        T::KIND,
        tool.into_data(),
    )
    .await
}

async fn create_conversation(state: &AppState) -> Result<RecordId, ApiError> {
    let mut result = state
        .db
        .query("CREATE conversations SET status = 'active' RETURN id")
        .await?;
    let id: Option<RecordId> = result.take("id")?;
    id.ok_or_else(|| ApiError::Internal("failed to create conversation".into()))
}

async fn persist_message(
    state: &AppState,
    conversation_id: &RecordId,
    msg: &CallMessage,
) -> Result<RecordId, ApiError> {
    let mut result = state
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

    let message_id: Option<RecordId> = result.take("id")?;
    message_id.ok_or_else(|| ApiError::Internal("failed to create message".into()))
}

async fn complete_conversation(
    state: &AppState,
    conversation_id: &RecordId,
) -> Result<(), ApiError> {
    state
        .db
        .query("UPDATE $conv SET status = 'completed', updated_at = time::now()")
        .bind(("conv", conversation_id.clone()))
        .await?;
    Ok(())
}

async fn create_intelligence(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: Option<&RecordId>,
    kind: &str,
    data: Value,
) -> Result<(), ApiError> {
    state
        .db
        .query(
            "CREATE intelligence SET \
                kind = $kind, \
                conversation = $conversation, \
                message = $message, \
                data = $data",
        )
        .bind(("kind", kind.to_string()))
        .bind(("conversation", conversation_id.clone()))
        .bind(("message", message_id.cloned()))
        .bind(("data", data))
        .await?;

    Ok(())
}

pub fn format_record_id(id: &RecordId) -> String {
    match &id.key {
        surrealdb::types::RecordIdKey::String(s) => format!("{}:{s}", id.table),
        surrealdb::types::RecordIdKey::Number(n) => format!("{}:{n}", id.table),
        other => format!("{}:{other:?}", id.table),
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/calls", post(create_call))
}
