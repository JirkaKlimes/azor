//! WebSocket message types for real-time call events.

use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use futures::SinkExt;
use futures::stream::SplitSink;
use serde::Serialize;
use tokio::sync::Mutex;

/// Type alias for the WebSocket sender wrapped in Arc<Mutex<...>>.
pub type WsSender = Arc<Mutex<SplitSink<WebSocket, Message>>>;

/// Messages sent from server to client over the call WebSocket.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    /// Connection established, provides conversation ID.
    Connected { conversation_id: String },

    /// Interim transcript (NOT persisted, updates as words arrive).
    InterimTranscript { role: String, content: String },

    /// Final transcript (persisted to DB).
    FinalTranscript {
        id: String,
        role: String,
        content: String,
    },

    /// Pipeline processing stage indicator.
    Processing {
        id: String,
        message_id: String,
        stage: String,
    },

    /// Validated highlight with document reference.
    Highlight {
        id: String,
        message_id: String,
        document_id: String,
        start_char: usize,
        end_char: usize,
        text: String,
    },

    /// Synthesized summary of relevant information.
    Summary {
        id: String,
        message_id: String,
        content: String,
    },

    /// Suggested operator response.
    Suggestion {
        id: String,
        message_id: String,
        content: String,
    },

    /// No relevant information found for the query.
    NoRelevantInfo { id: String, message_id: String },
}

/// Send a message over the WebSocket.
/// Logs errors but doesn't propagate them (fire-and-forget for events).
pub async fn send_message(ws: &WsSender, msg: ServerMessage) {
    let json = match serde_json::to_string(&msg) {
        Ok(j) => j,
        Err(e) => {
            tracing::error!("Failed to serialize ServerMessage: {}", e);
            return;
        }
    };

    let mut sender = ws.lock().await;
    if let Err(e) = sender.send(Message::Text(json.into())).await {
        tracing::warn!("Failed to send WebSocket message: {}", e);
    }
}
