use std::fmt::Write;

use documented::Documented;
use llm::builder::{FunctionBuilder, LLMBackend, LLMBuilder};
use llm::chat::{ChatMessage, ToolChoice};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use surrealdb::types::RecordId;

use super::events::{ServerMessage, WsSender, send_message};
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

trait CopilotTool: JsonSchema + Documented + Serialize {
    const KIND: &'static str;

    fn function_builder() -> FunctionBuilder {
        let name = std::any::type_name::<Self>()
            .split("::")
            .last()
            .unwrap_or("unknown");
        let schema =
            serde_json::to_value(schemars::schema_for!(Self)).expect("schema serialization");
        FunctionBuilder::new(name)
            .description(Self::DOCS)
            .json_schema(schema)
    }

    fn into_data(self) -> Value;
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
#[serde(rename = "highlight")]
/// Quote a specific, directly relevant passage from a knowledge base excerpt.
/// Include surrounding context so the passage can be precisely located via search.
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

impl CopilotTool for Highlight {
    const KIND: &'static str = "highlight";

    fn into_data(self) -> Value {
        serde_json::to_value(self).unwrap()
    }
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
#[serde(rename = "summary")]
/// Provide a synthesized overview of what the knowledge base says about the topic.
struct Summary {
    /// The summary text
    text: String,
}

impl CopilotTool for Summary {
    const KIND: &'static str = "summary";

    fn into_data(self) -> Value {
        serde_json::to_value(self).unwrap()
    }
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
#[serde(rename = "suggest")]
/// Draft a response the operator can say or adapt for the customer.
struct Suggest {
    /// The suggested response text
    text: String,
}

impl CopilotTool for Suggest {
    const KIND: &'static str = "suggestion";

    fn into_data(self) -> Value {
        serde_json::to_value(self).unwrap()
    }
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
#[serde(rename = "no_answer")]
/// Signal that the knowledge base excerpts do not contain information
/// relevant to the customer's question.
struct NoAnswer {
    /// Why the excerpts are not relevant
    reason: String,
}

impl CopilotTool for NoAnswer {
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
    #[error("database error: {0}")]
    Database(#[from] surrealdb::Error),
    #[error("failed to parse {tool} args: {source}")]
    ToolParse {
        tool: &'static str,
        source: serde_json::Error,
    },
}

pub async fn run_pipeline(
    state: &AppState,
    conversation_id: &RecordId,
    trigger_event_id: &RecordId,
    content: &str,
    ws: WsSender,
) -> Result<(), PipelineError> {
    let trigger_id = format_record_id(trigger_event_id);
    tracing::info!(conversation = %format_record_id(conversation_id), trigger = %trigger_id, "pipeline started");

    create_event(
        state,
        conversation_id,
        "processing",
        "system",
        "",
        Some(serde_json::json!({ "stage": "retrieving" })),
        Some(trigger_event_id),
        Some((&ws, &trigger_id)),
    )
    .await?;

    let chunks = retrieve_chunks(state, content)
        .await
        .map_err(PipelineError::Generic)?;
    tracing::info!(count = chunks.len(), "retrieved chunks");

    for chunk in &chunks {
        create_event(
            state,
            conversation_id,
            "retrieval",
            "system",
            "",
            Some(serde_json::json!({
                "chunk_id": chunk.id,
                "document_id": chunk.document_id,
                "source_path": chunk.source_path,
                "score": chunk.score,
            })),
            Some(trigger_event_id),
            None,
        )
        .await?;
    }

    if chunks.is_empty() {
        create_event(
            state,
            conversation_id,
            "no_relevant_info",
            "copilot",
            "",
            Some(serde_json::json!({ "reason": "No relevant knowledge base excerpts found." })),
            Some(trigger_event_id),
            Some((&ws, &trigger_id)),
        )
        .await?;
        return Ok(());
    }

    create_event(
        state,
        conversation_id,
        "processing",
        "system",
        "",
        Some(serde_json::json!({ "stage": "analyzing" })),
        Some(trigger_event_id),
        Some((&ws, &trigger_id)),
    )
    .await?;

    // TODO: Include conversation history in context (currently only uses triggering message)
    let conversation_context = fetch_conversation_context(state, conversation_id).await?;

    let llm = build_llm(state).map_err(|e| PipelineError::Generic(e.to_string()))?;
    let prompt = build_prompt(content, &conversation_context, &chunks);
    let response = llm
        .chat_with_tools(&[ChatMessage::user().content(prompt).build()], llm.tools())
        .await
        .map_err(|e| PipelineError::Generic(e.to_string()))?;

    if let Some(tool_calls) = response.tool_calls() {
        process_tool_calls(
            state,
            conversation_id,
            trigger_event_id,
            &trigger_id,
            &tool_calls,
            &chunks,
            &ws,
        )
        .await?;
    } else if let Some(text) = response.text() {
        tracing::warn!("LLM returned text instead of tool calls, storing as summary");
        create_event(
            state,
            conversation_id,
            "summary",
            "copilot",
            &text,
            Some(serde_json::json!({ "text": text })),
            Some(trigger_event_id),
            Some((&ws, &trigger_id)),
        )
        .await?;
    }

    Ok(())
}

async fn fetch_conversation_context(
    state: &AppState,
    conversation_id: &RecordId,
) -> Result<Vec<(String, String)>, surrealdb::Error> {
    let mut result = state
        .db
        .query(
            "SELECT role, content, created_at FROM events \
             WHERE conversation = $conv AND kind IN ['utterance', 'message'] AND role IN ['customer', 'operator'] \
             ORDER BY created_at ASC",
        )
        .bind(("conv", conversation_id.clone()))
        .await?;

    let rows: Vec<serde_json::Value> = result.take(0)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let role = row["role"].as_str()?.to_string();
            let content = row["content"].as_str()?.to_string();
            Some((role, content))
        })
        .collect())
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
        .ok_or("embedding returned no vectors")?
        .into_iter()
        .map(f64::from)
        .collect();

    let mut result = state
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

    let rows: Vec<serde_json::Value> = result.take(0).map_err(|e| e.to_string())?;
    rows.into_iter()
        .map(|row| {
            Ok(ChunkMatch {
                id: parse_record_id(&row, "id")?,
                document_id: parse_record_id(&row, "document_id")?,
                content: row["content"].as_str().unwrap_or_default().to_string(),
                source_path: row["source_path"].as_str().map(String::from),
                char_offset: row["char_offset"].as_i64().unwrap_or(0),
                score: row["score"].as_f64().unwrap_or(0.0),
            })
        })
        .collect()
}

fn parse_record_id(row: &serde_json::Value, field: &str) -> Result<String, String> {
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

fn build_prompt(
    trigger_content: &str,
    conversation: &[(String, String)],
    chunks: &[ChunkMatch],
) -> String {
    let mut prompt = String::new();

    if !conversation.is_empty() {
        writeln!(prompt, "## Conversation so far").unwrap();
        for (role, content) in conversation {
            writeln!(prompt, "**{role}**: {content}").unwrap();
        }
        writeln!(prompt).unwrap();
    }

    writeln!(prompt, "## Current message requiring assistance").unwrap();
    writeln!(prompt, "{trigger_content}").unwrap();

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

            match tc.function.name.to_lowercase().as_str() {
                "highlight" => Some(
                    serde_json::from_str(args)
                        .map(ToolAction::Highlight)
                        .map_err(parse("Highlight")),
                ),
                "summary" => Some(
                    serde_json::from_str(args)
                        .map(ToolAction::Summary)
                        .map_err(parse("Summary")),
                ),
                "suggest" => Some(
                    serde_json::from_str(args)
                        .map(ToolAction::Suggest)
                        .map_err(parse("Suggest")),
                ),
                "no_answer" | "noanswer" => Some(
                    serde_json::from_str(args)
                        .map(ToolAction::NoAnswer)
                        .map_err(parse("NoAnswer")),
                ),
                other => {
                    tracing::warn!(tool = other, "LLM called unknown tool");
                    None
                }
            }
        })
        .collect()
}

async fn process_tool_calls(
    state: &AppState,
    conversation_id: &RecordId,
    trigger_event_id: &RecordId,
    trigger_id: &str,
    tool_calls: &[llm::ToolCall],
    chunks: &[ChunkMatch],
    ws: &WsSender,
) -> Result<(), PipelineError> {
    for action in parse_tool_calls(tool_calls)? {
        match action {
            ToolAction::Highlight(h) => {
                process_highlight(state, conversation_id, trigger_event_id, trigger_id, h, chunks, ws).await?;
            }
            ToolAction::Summary(s) => {
                let text = s.text.clone();
                create_event(
                    state,
                    conversation_id,
                    Summary::KIND,
                    "copilot",
                    &text,
                    Some(s.into_data()),
                    Some(trigger_event_id),
                    Some((ws, trigger_id)),
                )
                .await?;
            }
            ToolAction::Suggest(s) => {
                let text = s.text.clone();
                create_event(
                    state,
                    conversation_id,
                    Suggest::KIND,
                    "copilot",
                    &text,
                    Some(s.into_data()),
                    Some(trigger_event_id),
                    Some((ws, trigger_id)),
                )
                .await?;
            }
            ToolAction::NoAnswer(n) => {
                let reason = n.reason.clone();
                create_event(
                    state,
                    conversation_id,
                    NoAnswer::KIND,
                    "copilot",
                    &reason,
                    Some(n.into_data()),
                    Some(trigger_event_id),
                    Some((ws, trigger_id)),
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
    trigger_event_id: &RecordId,
    trigger_id: &str,
    highlight: Highlight,
    chunks: &[ChunkMatch],
    ws: &WsSender,
) -> Result<(), PipelineError> {
    let Some(chunk) = chunks
        .iter()
        .find(|c| c.source_path.as_deref() == Some(&highlight.source_path))
    else {
        tracing::warn!(source_path = %highlight.source_path, "highlight source_path doesn't match any chunk");
        return Ok(());
    };

    let Some((rel_start, rel_end)) = fuzzy_find(&chunk.content, &highlight.text) else {
        tracing::warn!(text = %highlight.text, "highlight text not found in chunk");
        return Ok(());
    };

    let doc_start = chunk.char_offset as usize + rel_start;
    let doc_end = chunk.char_offset as usize + rel_end;

    create_event(
        state,
        conversation_id,
        Highlight::KIND,
        "copilot",
        &highlight.text,
        Some(serde_json::json!({
            "document_id": chunk.document_id,
            "start": doc_start,
            "end": doc_end,
            "source_path": chunk.source_path,
        })),
        Some(trigger_event_id),
        Some((ws, trigger_id)),
    )
    .await?;

    Ok(())
}

fn fuzzy_find(content: &str, needle: &str) -> Option<(usize, usize)> {
    let normalize = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    let normalized_needle = normalize(needle);

    if let Some(pos) = content.find(&normalized_needle) {
        return Some((pos, pos + normalized_needle.len()));
    }

    if let Some(pos) = content.find(needle) {
        return Some((pos, pos + needle.len()));
    }

    let normalized_content = normalize(content);
    if let Some(norm_pos) = normalized_content.find(&normalized_needle) {
        let char_count = normalized_content[..norm_pos].chars().count();
        let start = content
            .char_indices()
            .nth(char_count)
            .map(|(i, _)| i)
            .unwrap_or(0);
        let end_char = char_count + normalized_needle.chars().count();
        let end = content
            .char_indices()
            .nth(end_char)
            .map(|(i, _)| i)
            .unwrap_or(content.len());
        return Some((start, end));
    }

    None
}

#[allow(clippy::too_many_arguments)]
async fn create_event(
    state: &AppState,
    conversation_id: &RecordId,
    kind: &str,
    role: &str,
    content: &str,
    data: Option<Value>,
    trigger_event: Option<&RecordId>,
    ws_info: Option<(&WsSender, &str)>,
) -> Result<RecordId, surrealdb::Error> {
    let mut result = state
        .db
        .query(
            "CREATE events SET \
                conversation = $conversation, \
                kind = $kind, \
                role = $role, \
                content = $content, \
                data = $data, \
                trigger_event = $trigger_event \
            RETURN id",
        )
        .bind(("conversation", conversation_id.clone()))
        .bind(("kind", kind.to_string()))
        .bind(("role", role.to_string()))
        .bind(("content", content.to_string()))
        .bind(("data", data.clone()))
        .bind(("trigger_event", trigger_event.cloned()))
        .await?;

    let id: Option<RecordId> = result.take("id")?;
    let id = id.ok_or_else(|| surrealdb::Error::thrown("failed to create event".into()))?;

    let Some((ws, trigger_id)) = ws_info else {
        return Ok(id);
    };

    let id_str = format_record_id(&id);
    let event = match kind {
        "processing" => Some(ServerMessage::Processing {
            id: id_str,
            trigger_id: trigger_id.to_string(),
            stage: data
                .as_ref()
                .and_then(|d| d["stage"].as_str())
                .unwrap_or("")
                .to_string(),
        }),
        "highlight" => Some(ServerMessage::Highlight {
            id: id_str,
            trigger_id: trigger_id.to_string(),
            document_id: data
                .as_ref()
                .and_then(|d| d["document_id"].as_str())
                .unwrap_or("")
                .to_string(),
            start: data
                .as_ref()
                .and_then(|d| d["start"].as_u64())
                .unwrap_or(0) as usize,
            end: data
                .as_ref()
                .and_then(|d| d["end"].as_u64())
                .unwrap_or(0) as usize,
            text: content.to_string(),
        }),
        "summary" => Some(ServerMessage::Summary {
            id: id_str,
            trigger_id: trigger_id.to_string(),
            content: content.to_string(),
        }),
        "suggestion" => Some(ServerMessage::Suggestion {
            id: id_str,
            trigger_id: trigger_id.to_string(),
            content: content.to_string(),
        }),
        "no_relevant_info" => Some(ServerMessage::NoRelevantInfo {
            id: id_str,
            trigger_id: trigger_id.to_string(),
        }),
        _ => None,
    };

    if let Some(msg) = event {
        send_message(ws, msg).await;
    }

    Ok(id)
}
