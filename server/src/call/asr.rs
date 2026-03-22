use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;

use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const WEBSOCKET_URL: &str = "wss://stt-rt.soniox.com/transcribe-websocket";
const MODEL: &str = "stt-rt-preview";
const SAMPLE_RATE: u32 = 44100;
const CHANNELS: u32 = 1;

type WsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

#[derive(Debug, Clone)]
pub struct TranscriptWord {
    pub text: String,
    pub start: Duration,
    pub end: Duration,
    pub confidence: f32,
    pub is_final: bool,
}

#[derive(Debug, Clone)]
pub enum TranscriptEvent {
    Word(TranscriptWord),
    UtteranceEnd,
}

pub struct SonioxSession {
    write: Arc<Mutex<futures::stream::SplitSink<WsStream, Message>>>,
}

struct SonioxReader {
    read: futures::stream::SplitStream<WsStream>,
    buffered_events: VecDeque<TranscriptEvent>,
}

impl SonioxSession {
    pub async fn new(
        api_key: String,
        language_hints: Vec<String>,
        event_callback: impl Fn(TranscriptEvent) + Send + 'static,
    ) -> Result<Self, String> {
        let (ws_stream, _) = connect_async(WEBSOCKET_URL)
            .await
            .map_err(|e| format!("Failed to connect: {e}"))?;

        let (mut write, read) = ws_stream.split();

        let config = SonioxConfig {
            api_key: &api_key,
            model: MODEL,
            audio_format: "pcm_s16le",
            sample_rate: SAMPLE_RATE,
            num_channels: CHANNELS,
            language_hints: &language_hints,
            enable_endpoint_detection: true,
        };

        let json = serde_json::to_string(&config).map_err(|e| format!("Config error: {e}"))?;

        write
            .send(Message::Text(json.into()))
            .await
            .map_err(|e| format!("Failed to send config: {e}"))?;

        let write = Arc::new(Mutex::new(write));

        let mut reader = SonioxReader {
            read,
            buffered_events: VecDeque::new(),
        };

        tokio::spawn(async move {
            while let Some(event) = reader.recv().await {
                event_callback(event);
            }
        });

        Ok(Self { write })
    }

    pub async fn send_audio(&self, pcm: &[u8]) -> Result<(), String> {
        self.write
            .lock()
            .await
            .send(Message::Binary(pcm.to_vec().into()))
            .await
            .map_err(|e| format!("Failed to send audio: {e}"))
    }
}

impl SonioxReader {
    async fn recv(&mut self) -> Option<TranscriptEvent> {
        if let Some(event) = self.buffered_events.pop_front() {
            return Some(event);
        }

        loop {
            let msg = self.read.next().await?;

            match msg {
                Ok(Message::Text(text)) => {
                    self.parse_response(&text);
                    if let Some(event) = self.buffered_events.pop_front() {
                        return Some(event);
                    }
                }
                Ok(Message::Close(frame)) => {
                    tracing::debug!(?frame, "Soniox WebSocket closed");
                    return None;
                }
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!(error = %e, "Soniox WebSocket error");
                    return None;
                }
            }
        }
    }

    fn parse_response(&mut self, text: &str) {
        tracing::trace!(raw = %text, "Soniox response");

        let Ok(resp) = serde_json::from_str::<SonioxResponse>(text) else {
            tracing::warn!("Failed to parse Soniox response");
            return;
        };

        if let Some(code) = resp.error_code {
            let msg = resp.error_message.unwrap_or_default();
            tracing::error!(error_code = code, error_message = %msg, "Soniox API error");
            return;
        }

        for token in resp.tokens {
            if token.text == "<end>" {
                tracing::trace!("Utterance end");
                self.buffered_events
                    .push_back(TranscriptEvent::UtteranceEnd);
                continue;
            }

            let text = token.text.trim();
            if text.is_empty() {
                continue;
            }

            self.buffered_events
                .push_back(TranscriptEvent::Word(TranscriptWord {
                    text: text.to_string(),
                    start: Duration::from_millis(token.start_ms.unwrap_or(0) as u64),
                    end: Duration::from_millis(token.end_ms.unwrap_or(0) as u64),
                    confidence: token.confidence,
                    is_final: token.is_final,
                }));
        }
    }
}

#[derive(Serialize)]
struct SonioxConfig<'a> {
    api_key: &'a str,
    model: &'a str,
    audio_format: &'a str,
    sample_rate: u32,
    num_channels: u32,
    language_hints: &'a [String],
    enable_endpoint_detection: bool,
}

#[derive(Debug, Deserialize)]
struct SonioxResponse {
    #[serde(default)]
    tokens: Vec<SonioxToken>,
    #[serde(default)]
    error_code: Option<u16>,
    #[serde(default)]
    error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SonioxToken {
    text: String,
    #[serde(default)]
    start_ms: Option<i64>,
    #[serde(default)]
    end_ms: Option<i64>,
    #[serde(default)]
    confidence: f32,
    #[serde(default)]
    is_final: bool,
}
