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

use crate::call::events::{ServerMessage, WsSender, send_message};
use crate::call::{AudioChannel, AudioPacket, Call};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/api/call",
    responses(
        (status = 101, description = "WebSocket connection established"),
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
            tracing::error!("Failed to create call: {}", e);
            return;
        }
    };

    send_message(
        &ws_sender,
        ServerMessage::Connected {
            conversation_id: call.conversation_id().to_string(),
        },
    )
    .await;
    tracing::info!("Sent conversation ID: {}", call.conversation_id());

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Binary(data)) => {
                let packet = match parse_audio_packet(&data) {
                    Ok(packet) => packet,
                    Err(e) => {
                        tracing::warn!("Invalid audio packet: {}", e);
                        continue;
                    }
                };

                if let Err(e) = call.send_audio(packet).await {
                    tracing::error!("Failed to send audio: {}", e);
                }
            }
            Ok(Message::Text(text)) => {
                tracing::info!("Received text message: {}", text);
            }
            Ok(Message::Ping(data)) => {
                tracing::debug!("Received ping");
                let mut sender = ws_sender.lock().await;
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

    tracing::info!("WebSocket connection closed, flushing final transcripts");

    // Flush any pending audio and wait for final transcripts
    call.flush().await;

    tracing::info!("Call cleanup complete");
}

fn parse_audio_packet(data: &[u8]) -> Result<AudioPacket, String> {
    if data.len() < 4 {
        return Err(format!("Packet too small: {} bytes", data.len()));
    }

    let channel = AudioChannel::try_from(data[0]).map_err(|e| format!("Invalid channel: {}", e))?;

    let float_samples = &data[4..];
    if float_samples.len() % 4 != 0 {
        return Err(format!(
            "Invalid audio data length: {}",
            float_samples.len()
        ));
    }

    let num_samples = float_samples.len() / 4;
    let mut pcm = Vec::with_capacity(num_samples * 2);

    for i in 0..num_samples {
        let offset = i * 4;
        let sample_f32 = f32::from_le_bytes([
            float_samples[offset],
            float_samples[offset + 1],
            float_samples[offset + 2],
            float_samples[offset + 3],
        ]);

        let sample_i16 = (sample_f32 * 32768.0).clamp(-32768.0, 32767.0) as i16;
        pcm.extend_from_slice(&sample_i16.to_le_bytes());
    }

    Ok(AudioPacket { channel, pcm })
}

pub fn router() -> Router<AppState> {
    Router::new().route("/call", get(call_websocket))
}
