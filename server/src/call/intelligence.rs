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
You are an AI assistant helping a call center operator in real time.

CRITICAL RULES FOR REFERENCES:
- The number of [[ref:N]] markers in your content MUST EXACTLY MATCH the length of your references array
- If you write [[ref:0]], you MUST have references[0]. If you write [[ref:1]], you MUST have references[1].
- NEVER use a [[ref:N]] marker without a corresponding entry in your references array
- Count your refs before responding: if you have 2 references, only use [[ref:0]] and [[ref:1]]

RESPONSE STYLE:
- Be CONCISE and DIRECT - answer the specific question asked
- DO NOT list all variations or options unless specifically asked
- Focus on the SINGLE most relevant piece of information
- Keep responses to 1-2 sentences when possible

SUGGESTED RESPONSE RULES:
- The suggestion must be a DIRECT QUOTE the operator can say to the customer
- Write it as if the operator is speaking to the customer
- BAD: \"You can tell her to apply the discount online\" (meta-description)
- GOOD: \"The discount can be applied online when purchasing tickets.\" (direct speech)
- Only add a suggestion if it would genuinely help
- If your suggestion uses info from the knowledge base, include that reference in your content too

When citing knowledge base content:
- Use [[ref:N]] where N is the 0-based index into your references array
- Each reference needs 'text' (exact quote) and 'source_path' (from the excerpt header)";

#[derive(Debug, Deserialize, Serialize, JsonSchema, Documented)]
#[serde(rename = "respond")]
/// Respond to the operator with helpful information about the customer's needs.
/// Use [[ref:N]] markers in the content to reference knowledge base excerpts.
struct Respond {
    /// Conversational response with [[ref:N]] placeholders for references.
    /// Example: "The customer is asking about X [[ref:0]]. Also Y [[ref:1]]."
    content: String,
    /// References to knowledge base excerpts. Each becomes a [[ref:N]] box.
    /// Index N in [[ref:N]] corresponds to the array index here.
    references: Vec<RespondReference>,
    /// Optional suggested response for the operator to say to the customer
    suggestion: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
struct RespondReference {
    /// The excerpt text to highlight from the knowledge base
    text: String,
    /// The source path of the document (e.g., "invoicing/fksp.md")
    source_path: String,
}

#[derive(Debug)]
struct ChunkMatch {
    id: String,
    document_id: String,
    content: String,
    source_path: Option<String>,
    char_offset: i64,
    chunk_index: i64,
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
        create_response_event(
            state,
            conversation_id,
            trigger_event_id,
            &trigger_id,
            "I couldn't find any relevant information in the knowledge base for this topic.",
            Vec::new(),
            None,
            &ws,
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
        tracing::warn!("LLM returned text instead of tool calls, creating response");
        create_response_event(
            state,
            conversation_id,
            trigger_event_id,
            &trigger_id,
            &text,
            Vec::new(),
            None,
            &ws,
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
    // Build a strict JSON schema for the respond tool
    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "Conversational response with [[ref:N]] placeholders for references. Example: 'The customer is asking about X [[ref:0]]. Also Y [[ref:1]].'"
            },
            "references": {
                "type": "array",
                "description": "References to knowledge base excerpts. Each becomes a [[ref:N]] box. Index N in [[ref:N]] corresponds to the array index here.",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "The excerpt text to highlight from the knowledge base"
                        },
                        "source_path": {
                            "type": "string",
                            "description": "The source path of the document (e.g., 'invoicing/fksp.md')"
                        }
                    },
                    "required": ["text", "source_path"],
                    "additionalProperties": false
                }
            },
            "suggestion": {
                "type": ["string", "null"],
                "description": "Optional suggested response for the operator to say to the customer"
            }
        },
        "required": ["content", "references"],
        "additionalProperties": false
    });

    let respond_fn = FunctionBuilder::new("respond")
        .description("Respond to the operator with helpful information about the customer's needs. Use [[ref:N]] markers in the content to reference knowledge base excerpts.")
        .json_schema(schema);

    LLMBuilder::new()
        .backend(LLMBackend::OpenRouter)
        .api_key(&state.config.openrouter_api_key)
        .model(&state.config.llm_model)
        .extra_body(serde_json::json!({"provider": {"sort": "throughput"}}))
        .max_tokens(4096)
        .temperature(0.1)
        .system(SYSTEM_PROMPT)
        .function(respond_fn)
        .tool_choice(ToolChoice::Any)
        .enable_parallel_tool_use(false)
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
                chunk_index, \
                vector::similarity::cosine(embedding, $emb) AS score \
            FROM chunks \
            WHERE embedding <|7,40|> $emb \
            ORDER BY score DESC \
            LIMIT 7",
        )
        .bind(("emb", query_embedding))
        .await
        .map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = result.take(0).map_err(|e| e.to_string())?;
    let mut chunks: Vec<ChunkMatch> = rows
        .into_iter()
        .filter_map(|row| {
            Some(ChunkMatch {
                id: parse_record_id(&row, "id").ok()?,
                document_id: parse_record_id(&row, "document_id").ok()?,
                content: row["content"].as_str().unwrap_or_default().to_string(),
                source_path: row["source_path"].as_str().map(String::from),
                char_offset: row["char_offset"].as_i64().unwrap_or(0),
                chunk_index: row["chunk_index"].as_i64().unwrap_or(0),
                score: row["score"].as_f64().unwrap_or(0.0),
            })
        })
        .collect();

    // Fetch neighboring chunks for context
    for chunk in &mut chunks {
        if let Ok(context) = fetch_chunk_context(state, &chunk.document_id, chunk.chunk_index).await
        {
            chunk.content = context;
        }
    }

    Ok(chunks)
}

async fn fetch_chunk_context(
    state: &AppState,
    document_id: &str,
    chunk_index: i64,
) -> Result<String, String> {
    // Fetch the chunk before, current, and after
    let indices = [chunk_index - 1, chunk_index, chunk_index + 1];

    let mut result = state
        .db
        .query(
            "SELECT content, chunk_index FROM chunks \
             WHERE document = type::thing($doc) AND chunk_index IN $indices \
             ORDER BY chunk_index ASC",
        )
        .bind(("doc", document_id.to_string()))
        .bind(("indices", indices.to_vec()))
        .await
        .map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = result.take(0).map_err(|e| e.to_string())?;

    let merged: String = rows
        .iter()
        .filter_map(|row| row["content"].as_str())
        .collect::<Vec<_>>()
        .join(" ");

    if merged.is_empty() {
        Err("no chunks found".into())
    } else {
        Ok(merged)
    }
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

fn parse_respond_call(calls: &[llm::ToolCall]) -> Result<Option<Respond>, PipelineError> {
    for tc in calls {
        if tc.function.name.to_lowercase() == "respond" {
            let respond: Respond = serde_json::from_str(&tc.function.arguments)
                .map_err(|source| PipelineError::ToolParse { tool: "Respond", source })?;
            return Ok(Some(respond));
        }
    }
    Ok(None)
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
    let Some(respond) = parse_respond_call(tool_calls)? else {
        tracing::warn!("LLM did not call respond tool");
        return Ok(());
    };

    // Process references to get document positions
    // IMPORTANT: Always include all references to keep indices aligned with [[ref:N]] markers
    let references: Vec<_> = respond
        .references
        .iter()
        .map(|ref_item| {
            process_reference(&ref_item.text, &ref_item.source_path, chunks)
                .unwrap_or_else(|| {
                    // Fallback: include reference without document position
                    tracing::warn!(
                        text = %ref_item.text,
                        source_path = %ref_item.source_path,
                        "could not find reference in chunks"
                    );
                    super::events::Reference {
                        document_id: String::new(),
                        start: 0,
                        end: 0,
                        text: ref_item.text.clone(),
                    }
                })
        })
        .collect();

    // Create the response event
    create_response_event(
        state,
        conversation_id,
        trigger_event_id,
        trigger_id,
        &respond.content,
        references,
        respond.suggestion.as_deref(),
        ws,
    )
    .await?;

    Ok(())
}

fn process_reference(
    text: &str,
    source_path: &str,
    chunks: &[ChunkMatch],
) -> Option<super::events::Reference> {
    let chunk = chunks
        .iter()
        .find(|c| c.source_path.as_deref() == Some(source_path))?;

    // Find position within chunk, fallback to chunk start
    let (rel_start, rel_end) = fuzzy_find(&chunk.content, text)
        .unwrap_or((0, text.len().min(chunk.content.len())));

    let doc_start = chunk.char_offset as usize + rel_start;
    let doc_end = chunk.char_offset as usize + rel_end;

    Some(super::events::Reference {
        document_id: chunk.document_id.clone(),
        start: doc_start,
        end: doc_end,
        text: text.to_string(),
    })
}

async fn create_response_event(
    state: &AppState,
    conversation_id: &RecordId,
    trigger_event_id: &RecordId,
    trigger_id: &str,
    content: &str,
    references: Vec<super::events::Reference>,
    suggestion: Option<&str>,
    ws: &WsSender,
) -> Result<RecordId, surrealdb::Error> {
    let data = serde_json::json!({
        "references": references,
        "suggestion": suggestion,
    });

    let mut result = state
        .db
        .query(
            "CREATE events SET \
                conversation = $conversation, \
                kind = 'response', \
                role = 'copilot', \
                content = $content, \
                data = $data, \
                trigger_event = $trigger_event \
            RETURN id",
        )
        .bind(("conversation", conversation_id.clone()))
        .bind(("content", content.to_string()))
        .bind(("data", data.clone()))
        .bind(("trigger_event", trigger_event_id.clone()))
        .await?;

    let id: Option<RecordId> = result.take("id")?;
    let id = id.ok_or_else(|| surrealdb::Error::thrown("failed to create event".into()))?;

    let id_str = format_record_id(&id);
    let msg = ServerMessage::Response {
        id: id_str,
        trigger_id: trigger_id.to_string(),
        content: content.to_string(),
        references,
        suggestion: suggestion.map(String::from),
    };
    send_message(ws, msg).await;

    Ok(id)
}


fn fuzzy_find(content: &str, needle: &str) -> Option<(usize, usize)> {
    // Case-insensitive search using lowercase
    let lower_content = content.to_lowercase();
    let lower_needle = needle.to_lowercase();

    // 1. Exact substring match
    if let Some(pos) = lower_content.find(&lower_needle) {
        return Some((pos, pos + lower_needle.len()));
    }

    // 2. Try first few words (LLM often truncates)
    let words: Vec<&str> = lower_needle.split_whitespace().collect();
    if words.len() >= 3 {
        let prefix: String = words[..3].join(" ");
        if let Some(start) = lower_content.find(&prefix) {
            let end = (start + lower_needle.len()).min(content.len());
            return Some((start, end));
        }
    }

    // 3. Fuzzy: find best matching window using strsim
    let needle_chars: Vec<char> = lower_needle.chars().collect();
    let content_chars: Vec<char> = lower_content.chars().collect();

    if needle_chars.len() < 5 || content_chars.len() < needle_chars.len() {
        return None;
    }

    let window_len = needle_chars.len();
    let mut best = (0.0, 0usize);

    for start in 0..=content_chars.len().saturating_sub(window_len) {
        let window: String = content_chars[start..start + window_len].iter().collect();
        let score = strsim::normalized_levenshtein(&lower_needle, &window);
        if score > best.0 {
            best = (score, start);
        }
    }

    if best.0 > 0.6 {
        // Convert char index to byte index
        let byte_start: usize = content.chars().take(best.1).map(|c| c.len_utf8()).sum();
        let byte_end: usize = byte_start + content.chars().skip(best.1).take(window_len).map(|c| c.len_utf8()).sum::<usize>();
        return Some((byte_start, byte_end));
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
        _ => None,
    };

    if let Some(msg) = event {
        send_message(ws, msg).await;
    }

    Ok(id)
}
