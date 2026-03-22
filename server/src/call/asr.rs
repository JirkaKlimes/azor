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

/// Buffer for accumulating subword tokens into complete words.
struct WordBuffer {
    text: String,
    end: Duration,
    min_confidence: f32,
    all_final: bool,
}

struct SonioxReader {
    read: futures::stream::SplitStream<WsStream>,
    buffered_events: VecDeque<TranscriptEvent>,
    /// Buffer for accumulating subword tokens into complete words.
    word_buffer: Option<WordBuffer>,
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
            word_buffer: None,
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

    /// Flush buffered audio by sending an empty binary frame
    /// This signals Soniox to finalize processing of all sent audio
    pub async fn flush(&self) -> Result<(), String> {
        self.write
            .lock()
            .await
            .send(Message::Binary(Vec::new().into()))
            .await
            .map_err(|e| format!("Failed to flush: {e}"))
    }

    /// Close the WebSocket connection gracefully
    pub async fn close(&self) -> Result<(), String> {
        self.write
            .lock()
            .await
            .send(Message::Close(None))
            .await
            .map_err(|e| format!("Failed to close: {e}"))
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
                // Flush any buffered word before the utterance end
                if let Some(word) = self.flush_word_buffer() {
                    self.buffered_events.push_back(word);
                }
                self.buffered_events
                    .push_back(TranscriptEvent::UtteranceEnd);
                continue;
            }

            // Check if this is a word boundary (token starts with space)
            let is_word_boundary =
                token.text.starts_with(' ') || token.text.starts_with('\u{00A0}');

            // Flush buffer on word boundary
            if is_word_boundary {
                if let Some(word) = self.flush_word_buffer() {
                    self.buffered_events.push_back(word);
                }
            }

            // Get trimmed text for this token
            let trimmed = token.text.trim();
            if trimmed.is_empty() {
                continue;
            }

            let end = Duration::from_millis(token.end_ms.unwrap_or(0) as u64);

            // Accumulate into word buffer
            if let Some(ref mut buf) = self.word_buffer {
                buf.text.push_str(trimmed);
                buf.end = end;
                buf.min_confidence = buf.min_confidence.min(token.confidence);
                buf.all_final = buf.all_final && token.is_final;
            } else {
                self.word_buffer = Some(WordBuffer {
                    text: trimmed.to_string(),
                    end,
                    min_confidence: token.confidence,
                    all_final: token.is_final,
                });
            }
        }
    }

    /// Flush the word buffer and return a `TranscriptEvent::Word` if non-empty.
    fn flush_word_buffer(&mut self) -> Option<TranscriptEvent> {
        let buf = self.word_buffer.take()?;
        if buf.text.is_empty() {
            return None;
        }
        Some(TranscriptEvent::Word(TranscriptWord {
            text: buf.text,
            is_final: buf.all_final,
        }))
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
    end_ms: Option<i64>,
    #[serde(default)]
    confidence: f32,
    #[serde(default)]
    is_final: bool,
}
