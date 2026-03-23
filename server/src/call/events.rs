use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use futures::stream::SplitSink;
use futures::SinkExt;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

pub type WsSender = Arc<Mutex<SplitSink<WebSocket, Message>>>;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Message { content: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Connected {
        conversation_id: String,
    },
    InterimTranscript {
        role: String,
        content: String,
    },
    Utterance {
        id: String,
        role: String,
        content: String,
    },
    Message {
        id: String,
        role: String,
        content: String,
    },
    Processing {
        id: String,
        trigger_id: String,
        stage: String,
    },
    Highlight {
        id: String,
        trigger_id: String,
        document_id: String,
        start: usize,
        end: usize,
        text: String,
    },
    Summary {
        id: String,
        trigger_id: String,
        content: String,
    },
    Suggestion {
        id: String,
        trigger_id: String,
        content: String,
    },
    NoRelevantInfo {
        id: String,
        trigger_id: String,
    },
}

pub async fn send_message(ws: &WsSender, msg: ServerMessage) {
    let Ok(json) = serde_json::to_string(&msg) else {
        tracing::error!("failed to serialize ServerMessage");
        return;
    };

    let mut sender = ws.lock().await;
    if let Err(e) = sender.send(Message::Text(json.into())).await {
        tracing::warn!(error = %e, "failed to send WebSocket message");
    }
}
