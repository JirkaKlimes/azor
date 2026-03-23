use std::fmt::Write;

use documented::Documented;
use llm::builder::{FunctionBuilder, LLMBackend, LLMBuilder};
use llm::chat::{ChatMessage, ToolChoice};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use surrealdb::types::RecordId;

use crate::call::events::{ServerMessage, WsSender, send_message};
use crate::ingest::embed;
use crate::state::AppState;
use crate::util::format_record_id;

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

trait CallTool: JsonSchema + Documented + Serialize {
    /// The intelligence `kind` stored in the database (e.g. "highlight", "summary").
    const KIND: &'static str;

    /// Derive a `FunctionBuilder` from the struct's JSON Schema and doc comment.
    fn function_builder() -> FunctionBuilder {
        let name = {
            let full = std::any::type_name::<Self>();
            full.split("::").last().unwrap_or(full)
        };
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
    const KIND: &'static str = "no_relevant_info";

    fn into_data(self) -> Value {
        serde_json::json!({ "reason": self.reason })
    }
}

#[derive(Debug)]
struct ChunkMatch {
    id: String,
    document_id: String,
    content: String,
    source_path: Option<String>,
    char_offset: i64,
    score: f64,
}

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("{0}")]
    Generic(String),
    #[error("Database error: {0}")]
    Database(#[from] surrealdb::Error),
    #[error("Failed to parse {tool} args: {source}")]
    ToolParse {
        tool: &'static str,
        source: serde_json::Error,
    },
}

/// Run the intelligence pipeline for a customer message.
///
/// This function:
/// 1. Sends "processing" event (stage: retrieving)
/// 2. Retrieves relevant chunks from the knowledge base
/// 3. Sends "processing" event (stage: analyzing)
/// 4. Runs the LLM with the chunks as context
/// 5. Validates highlights and converts to char offsets
/// 6. Stores result records and sends events via WebSocket
pub async fn run_pipeline(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: &RecordId,
    content: &str,
    ws: WsSender,
) -> Result<(), PipelineError> {
    tracing::info!(
        "run_pipeline started: conv={:?}, msg={:?}, content_len={}",
        conversation_id,
        message_id,
        content.len()
    );

    let _msg_id_str = format_record_id(message_id);

    // Send processing event: retrieving
    tracing::debug!("Creating processing record: retrieving");
    create_processing(state, conversation_id, Some(message_id), "retrieving", &ws).await?;
    tracing::debug!("Processing record created");

    // Retrieve relevant chunks
    tracing::info!("Retrieving relevant chunks for content: '{}'", content);
    let chunks = retrieve_chunks(state, content)
        .await
        .map_err(PipelineError::Generic)?;
    tracing::info!("Retrieved {} chunks", chunks.len());

    // Insert retrieval records (no event emission for these)
    for chunk in &chunks {
        create_intelligence(
            state,
            conversation_id,
            Some(message_id),
            "retrieval",
            serde_json::json!({
                "chunk_id": chunk.id.clone(),
                "document_id": chunk.document_id.clone(),
                "source_path": chunk.source_path,
                "score": chunk.score,
            }),
            None,
        )
        .await?;
    }

    if chunks.is_empty() {
        create_intelligence(
            state,
            conversation_id,
            Some(message_id),
            "no_relevant_info",
            serde_json::json!({ "reason": "No relevant knowledge base excerpts found." }),
            Some(&ws),
        )
        .await?;

        return Ok(());
    }

    // Send processing event: analyzing
    create_processing(state, conversation_id, Some(message_id), "analyzing", &ws).await?;

    // Build LLM and run analysis
    let llm = build_llm(state).map_err(|e| PipelineError::Generic(e.to_string()))?;

    let prompt = build_prompt(content, &chunks);
    let chat_messages = vec![ChatMessage::user().content(prompt).build()];

    let response = llm
        .chat_with_tools(&chat_messages, llm.tools())
        .await
        .map_err(|e| PipelineError::Generic(e.to_string()))?;

    if let Some(tool_calls) = response.tool_calls() {
        process_tool_calls(
            state,
            conversation_id,
            message_id,
            &tool_calls,
            &chunks,
            &ws,
        )
        .await?;
    } else if let Some(text) = response.text() {
        tracing::warn!("LLM returned text instead of tool calls, storing as summary");
        create_intelligence(
            state,
            conversation_id,
            Some(message_id),
            "summary",
            serde_json::json!({ "text": text }),
            Some(&ws),
        )
        .await?;
    }

    Ok(())
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

async fn retrieve_chunks(state: &AppState, content: &str) -> Result<Vec<ChunkMatch>, String> {
    let embeddings = embed::embed_batch(state, &[content], embed::InputType::Query)
        .await
        .map_err(|e| e.to_string())?;

    let query_embedding: Vec<f64> = embeddings
        .into_iter()
        .next()
        .ok_or_else(|| "embedding returned no vectors".to_string())?
        .into_iter()
        .map(f64::from)
        .collect();

    let mut search_result = state
        .db
        .query(
            "SELECT \
                id, \
                document AS document_id, \
                content, \
                document.source_path AS source_path, \
                char_offset, \
                vector::similarity::cosine(embedding, $emb) AS score \
            FROM chunks \
            WHERE embedding <|10,40|> $emb \
            ORDER BY score DESC \
            LIMIT 10",
        )
        .bind(("emb", query_embedding))
        .await
        .map_err(|e| e.to_string())?;

    // Parse results manually since we have a complex query
    let rows: Vec<serde_json::Value> = search_result.take(0).map_err(|e| e.to_string())?;

    let mut matches = Vec::new();
    for row in rows {
        matches.push(ChunkMatch {
            id: parse_record_id_str(&row, "id")?,
            document_id: parse_record_id_str(&row, "document_id")?,
            content: row["content"].as_str().unwrap_or_default().to_string(),
            source_path: row["source_path"].as_str().map(String::from),
            char_offset: row["char_offset"].as_i64().unwrap_or(0),
            score: row["score"].as_f64().unwrap_or(0.0),
        });
    }

    Ok(matches)
}

fn parse_record_id_str(row: &serde_json::Value, field: &str) -> Result<String, String> {
    let value = &row[field];

    if let Some(s) = value.as_str() {
        return Ok(s.to_string());
    }

    if let Some(obj) = value.as_object() {
        let table = obj["tb"]
            .as_str()
            .ok_or_else(|| format!("missing tb in {field}"))?;
        let id = &obj["id"];
        let id_str = id
            .as_str()
            .map(String::from)
            .or_else(|| id.as_i64().map(|n| n.to_string()))
            .ok_or_else(|| format!("invalid id type in {field}"))?;
        return Ok(format!("{table}:{id_str}"));
    }

    Err(format!("cannot parse record ID from {field}"))
}

fn build_prompt(content: &str, chunks: &[ChunkMatch]) -> String {
    let mut prompt = String::new();

    writeln!(prompt, "## Customer message").unwrap();
    writeln!(prompt, "{content}").unwrap();

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

enum ToolAction {
    Highlight(Highlight),
    Summary(Summary),
    Suggest(Suggest),
    NoAnswer(NoAnswer),
}

fn parse_tool_calls(calls: &[llm::ToolCall]) -> Result<Vec<ToolAction>, PipelineError> {
    calls
        .iter()
        .filter_map(|tc| {
            let args = &tc.function.arguments;
            let parse =
                |tool: &'static str| move |source| PipelineError::ToolParse { tool, source };

            match tc.function.name.as_str() {
                "Highlight" | "highlight" => Some(
                    serde_json::from_str(args)
                        .map(ToolAction::Highlight)
                        .map_err(parse("Highlight")),
                ),
                "Summary" | "summary" => Some(
                    serde_json::from_str(args)
                        .map(ToolAction::Summary)
                        .map_err(parse("Summary")),
                ),
                "Suggest" | "suggest" => Some(
                    serde_json::from_str(args)
                        .map(ToolAction::Suggest)
                        .map_err(parse("Suggest")),
                ),
                "NoAnswer" | "no_answer" => Some(
                    serde_json::from_str(args)
                        .map(ToolAction::NoAnswer)
                        .map_err(parse("NoAnswer")),
                ),
                other => {
                    tracing::warn!(tool = other, "LLM called unknown tool, skipping");
                    None
                }
            }
        })
        .collect()
}

async fn process_tool_calls(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: &RecordId,
    tool_calls: &[llm::ToolCall],
    chunks: &[ChunkMatch],
    ws: &WsSender,
) -> Result<(), PipelineError> {
    for action in parse_tool_calls(tool_calls)? {
        match action {
            ToolAction::Highlight(h) => {
                process_highlight(state, conversation_id, message_id, h, chunks, ws).await?;
            }
            ToolAction::Summary(t) => {
                create_intelligence(
                    state,
                    conversation_id,
                    Some(message_id),
                    Summary::KIND,
                    t.into_data(),
                    Some(ws),
                )
                .await?;
            }
            ToolAction::Suggest(t) => {
                create_intelligence(
                    state,
                    conversation_id,
                    Some(message_id),
                    Suggest::KIND,
                    t.into_data(),
                    Some(ws),
                )
                .await?;
            }
            ToolAction::NoAnswer(t) => {
                create_intelligence(
                    state,
                    conversation_id,
                    Some(message_id),
                    NoAnswer::KIND,
                    t.into_data(),
                    Some(ws),
                )
                .await?;
            }
        }
    }
    Ok(())
}

async fn process_highlight(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: &RecordId,
    highlight: Highlight,
    chunks: &[ChunkMatch],
    ws: &WsSender,
) -> Result<(), PipelineError> {
    let matching_chunk = chunks
        .iter()
        .find(|c| c.source_path.as_deref() == Some(&highlight.source_path));

    let Some(chunk) = matching_chunk else {
        tracing::warn!(
            source_path = %highlight.source_path,
            "Highlight source_path doesn't match any retrieved chunk, skipping"
        );
        return Ok(());
    };

    // Validate and find the highlight in the chunk content
    let Some((rel_start, rel_end)) = fuzzy_find(&chunk.content, &highlight.text) else {
        tracing::warn!(
            text = %highlight.text,
            "Highlight text not found in chunk content, skipping"
        );
        return Ok(());
    };

    // Convert to document offsets
    let doc_start = chunk.char_offset as usize + rel_start;
    let doc_end = chunk.char_offset as usize + rel_end;

    create_intelligence(
        state,
        conversation_id,
        Some(message_id),
        Highlight::KIND,
        serde_json::json!({
            "document_id": chunk.document_id.clone(),
            "start": doc_start,
            "end": doc_end,
            "source_path": chunk.source_path,
        }),
        Some(ws),
    )
    .await?;

    Ok(())
}

/// Find a substring in content using fuzzy matching (normalized whitespace).
/// Returns (start, end) char offsets if found.
fn fuzzy_find(content: &str, needle: &str) -> Option<(usize, usize)> {
    // Normalize the needle
    let normalized_needle = normalize_whitespace(needle);

    // Try exact match first
    if let Some(pos) = content.find(&normalized_needle) {
        return Some((pos, pos + normalized_needle.len()));
    }

    // Try finding the original needle
    if let Some(pos) = content.find(needle) {
        return Some((pos, pos + needle.len()));
    }

    // Try normalized content match
    let normalized_content = normalize_whitespace(content);
    if let Some(norm_pos) = normalized_content.find(&normalized_needle) {
        // Map normalized position back to original content
        // This is approximate but should work for most cases
        let char_count = normalized_content[..norm_pos].chars().count();
        let original_pos = content
            .char_indices()
            .nth(char_count)
            .map(|(i, _)| i)
            .unwrap_or(0);

        // Find the end by searching for where the match ends
        let needle_char_count = normalized_needle.chars().count();
        let end_char_count = char_count + needle_char_count;
        let original_end = content
            .char_indices()
            .nth(end_char_count)
            .map(|(i, _)| i)
            .unwrap_or(content.len());

        return Some((original_pos, original_end));
    }

    None
}

/// Normalize whitespace: collapse multiple spaces/newlines into single space, trim.
fn normalize_whitespace(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

async fn create_intelligence(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: Option<&RecordId>,
    kind: &str,
    data: Value,
    ws: Option<&WsSender>,
) -> Result<RecordId, surrealdb::Error> {
    let mut result = state
        .db
        .query(
            "CREATE intelligence SET \
                kind = $kind, \
                conversation = $conversation, \
                message = $message, \
                data = $data \
            RETURN id",
        )
        .bind(("kind", kind.to_string()))
        .bind(("conversation", conversation_id.clone()))
        .bind(("message", message_id.cloned()))
        .bind(("data", data.clone()))
        .await?;

    let id: Option<RecordId> = result.take("id")?;
    let id = id
        .ok_or_else(|| surrealdb::Error::internal("failed to create intelligence record".into()))?;

    let Some(ws) = ws else { return Ok(id) };

    let id_str = format_record_id(&id);
    let msg_id_str = message_id.map(format_record_id).unwrap_or_default();

    let event = match kind {
        "highlight" => Some(ServerMessage::Highlight {
            id: id_str,
            message_id: msg_id_str,
            document_id: data["document_id"].as_str().unwrap_or_default().to_string(),
            start_char: data["start"].as_u64().unwrap_or(0) as usize,
            end_char: data["end"].as_u64().unwrap_or(0) as usize,
            text: data["text"].as_str().unwrap_or_default().to_string(),
        }),
        "summary" => Some(ServerMessage::Summary {
            id: id_str,
            message_id: msg_id_str,
            content: data["text"].as_str().unwrap_or_default().to_string(),
        }),
        "suggestion" => Some(ServerMessage::Suggestion {
            id: id_str,
            message_id: msg_id_str,
            content: data["text"].as_str().unwrap_or_default().to_string(),
        }),
        "no_relevant_info" => Some(ServerMessage::NoRelevantInfo {
            id: id_str,
            message_id: msg_id_str,
        }),
        _ => None,
    };

    if let Some(e) = event {
        send_message(ws, e).await;
    }

    Ok(id)
}

/// Create processing record and emit event via WebSocket.
async fn create_processing(
    state: &AppState,
    conversation_id: &RecordId,
    message_id: Option<&RecordId>,
    stage: &str,
    ws: &WsSender,
) -> Result<RecordId, surrealdb::Error> {
    let mut result = state
        .db
        .query(
            "CREATE intelligence SET \
                kind = 'processing', \
                status = 'pending', \
                conversation = $conversation, \
                message = $message, \
                data = { stage: $stage } \
            RETURN id",
        )
        .bind(("conversation", conversation_id.clone()))
        .bind(("message", message_id.cloned()))
        .bind(("stage", stage.to_string()))
        .await?;

    let id: Option<RecordId> = result.take("id")?;
    let id =
        id.ok_or_else(|| surrealdb::Error::internal("failed to create processing record".into()))?;

    // Emit event via WebSocket
    if let Some(msg_id) = message_id {
        send_message(
            ws,
            ServerMessage::Processing {
                id: format_record_id(&id),
                message_id: format_record_id(msg_id),
                stage: stage.to_string(),
            },
        )
        .await;
    }

    Ok(id)
}
