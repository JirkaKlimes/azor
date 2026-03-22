// WebSocket endpoint for real-time call audio streaming.
// Receives audio from two channels: microphone and screen capture.

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

use crate::state::AppState;

/// Format a SurrealDB RecordId as a string (e.g., "table:id")
pub fn format_record_id(id: &surrealdb::types::RecordId) -> String {
    match &id.key {
        surrealdb::types::RecordIdKey::String(s) => format!("{}:{s}", id.table),
        surrealdb::types::RecordIdKey::Number(n) => format!("{}:{n}", id.table),
        other => format!("{}:{other:?}", id.table),
    }
}

#[utoipa::path(
    get,
    path = "/api/calls/ws",
    responses(
        (status = 101, description = "WebSocket connection established"),
        (status = 400, description = "Bad request"),
    ),
    tag = "calls"
)]
pub async fn call_websocket(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, _state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    tracing::info!("WebSocket connection established");

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Binary(data)) => {
                tracing::info!("Received binary packet: {} bytes", data.len());
                // Expected format:
                // - First 4 bytes: channel ID in byte 0, bytes 1-3 are padding
                // - Remaining bytes: Float32 audio data

                if data.len() < 4 {
                    tracing::warn!("Packet too small: {} bytes", data.len());
                    continue;
                }

                let channel = data[0];
                let audio_data_len = data.len() - 4;
                let num_samples = audio_data_len / 4; // Float32 = 4 bytes per sample

                match channel {
                    0 => tracing::info!("Mic audio: {} samples ({} bytes)", num_samples, audio_data_len),
                    1 => tracing::info!("Screen capture audio: {} samples ({} bytes)", num_samples, audio_data_len),
                    _ => tracing::warn!("Unknown channel: {}", channel),
                }

                // TODO: Decode Float32 samples and process for transcription
                // let samples = &data[4..]; // Skip 4-byte header
            }
            Ok(Message::Text(text)) => {
                tracing::info!("Received text message: {}", text);
            }
            Ok(Message::Ping(data)) => {
                tracing::debug!("Received ping");
                if let Err(e) = sender.send(Message::Pong(data)).await {
                    tracing::error!("Failed to send pong: {}", e);
                    break;
                }
            }
            Ok(Message::Pong(_)) => {
                tracing::debug!("Received pong");
            }
            Ok(Message::Close(frame)) => {
                tracing::info!("WebSocket closed: {:?}", frame);
                break;
            }
            Err(e) => {
                tracing::error!("WebSocket error: {}", e);
                break;
            }
        }
    }

    tracing::info!("WebSocket connection closed");
}

pub fn router() -> Router<AppState> {
    Router::new().route("/calls/ws", get(call_websocket))
}
