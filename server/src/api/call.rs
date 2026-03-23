use std::sync::Arc;

use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Response,
    routing::get,
};
use futures::{SinkExt, StreamExt};
use tokio::sync::Mutex;

use crate::call::events::{ClientMessage, ServerMessage, WsSender, send_message};
use crate::call::{AudioChannel, AudioPacket, Call};
use crate::state::AppState;
use crate::util::format_record_id;

/// Real-time call copilot WebSocket endpoint.
///
/// Establishes a bidirectional WebSocket connection for real-time call assistance.
/// The copilot transcribes speech, retrieves relevant knowledge base excerpts,
/// and provides suggestions to help operators respond to customers.
///
/// ## Client → Server Messages
///
/// ### Audio (Binary)
/// Stream audio for transcription. Format: `[channel, 0, 0, 0, f32_le_samples...]`
/// - `channel`: `0` = operator, `1` = customer
/// - Samples: 32-bit float little-endian PCM at 44.1kHz mono
///
/// ### Text Messages (JSON)
/// ```json
/// { "type": "message", "content": "your question to the copilot" }
/// ```
/// Operator can send text messages to query the copilot directly.
///
/// ## Server → Client Messages (JSON)
///
/// | Type | Description |
/// |------|-------------|
/// | `connected` | Connection established, contains `conversation_id` |
/// | `interim_transcript` | Real-time transcription update (not persisted) |
/// | `utterance` | Final transcription of speech (persisted) |
/// | `message` | Text message from operator or copilot |
/// | `processing` | Pipeline status indicator (`retrieving`, `analyzing`) |
/// | `highlight` | Document excerpt with `document_id`, `start`, `end`, `text` |
/// | `summary` | Synthesized summary from knowledge base |
/// | `suggestion` | Suggested response for the operator |
/// | `no_relevant_info` | No relevant knowledge base content found |
///
/// All copilot responses include a `trigger_id` linking to the event that triggered them.
#[utoipa::path(
    get,
    path = "/api/call",
    responses(
        (status = 101, description = "WebSocket connection upgraded"),
        (status = 400, description = "Bad request"),
    ),
    tag = "calls"
)]
pub async fn call_websocket(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (sender, mut receiver) = socket.split();
    let ws_sender: WsSender = Arc::new(Mutex::new(sender));

    tracing::info!("WebSocket connection established");

    // TODO: Extract user from JWT auth instead of using hardcoded demo user
    let demo_user_id = "demo".to_string();

    let call = match Call::new(state, demo_user_id, ws_sender.clone()).await {
        Ok(call) => call,
        Err(e) => {
            tracing::error!(error = %e, "failed to create call");
            return;
        }
    };

    let conversation_id = format_record_id(call.conversation_record_id());
    send_message(
        &ws_sender,
        ServerMessage::Connected {
            conversation_id: conversation_id.clone(),
        },
    )
    .await;
    tracing::info!(conversation_id = %conversation_id, "call started");

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Binary(data)) => {
                if let Err(e) = handle_audio(&call, &data).await {
                    tracing::warn!(error = %e, "failed to handle audio");
                }
            }
            Ok(Message::Text(text)) => {
                if let Err(e) = handle_text(&call, &text).await {
                    tracing::warn!(error = %e, "failed to handle text message");
                }
            }
            Ok(Message::Ping(data)) => {
                let mut sender = ws_sender.lock().await;
                if sender.send(Message::Pong(data)).await.is_err() {
                    break;
                }
            }
            Ok(Message::Pong(_)) => {}
            Ok(Message::Close(frame)) => {
                tracing::info!(?frame, "WebSocket closed");
                break;
            }
            Err(e) => {
                tracing::error!(error = %e, "WebSocket error");
                break;
            }
        }
    }

    tracing::info!("flushing final transcripts");
    call.flush().await;
    tracing::info!("call cleanup complete");
}

async fn handle_audio(call: &Call, data: &[u8]) -> Result<(), String> {
    let packet = parse_audio_packet(data)?;
    call.send_audio(packet).await.map_err(|e| e.to_string())
}

async fn handle_text(call: &Call, text: &str) -> Result<(), String> {
    let msg: ClientMessage = serde_json::from_str(text).map_err(|e| e.to_string())?;
    call.handle_message(msg).await.map_err(|e| e.to_string())
}

fn parse_audio_packet(data: &[u8]) -> Result<AudioPacket, String> {
    if data.len() < 4 {
        return Err(format!("packet too small: {} bytes", data.len()));
    }

    let channel = AudioChannel::try_from(data[0]).map_err(|e| e.to_string())?;
    let float_samples = &data[4..];

    if float_samples.len() % 4 != 0 {
        return Err(format!("invalid audio data length: {}", float_samples.len()));
    }

    let pcm: Vec<u8> = float_samples
        .chunks_exact(4)
        .flat_map(|chunk| {
            let sample_f32 = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
            let sample_i16 = (sample_f32 * 32768.0).clamp(-32768.0, 32767.0) as i16;
            sample_i16.to_le_bytes()
        })
        .collect();

    Ok(AudioPacket { channel, pcm })
}

pub fn router() -> Router<AppState> {
    Router::new().route("/call", get(call_websocket))
}
