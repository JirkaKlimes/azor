pub mod asr;
pub mod events;
pub mod intelligence;

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use surrealdb::Surreal;
use surrealdb::engine::any::Any;
use surrealdb::types::RecordId;
use thiserror::Error;
use tokio::sync::{Notify, mpsc};

use asr::{SonioxSession, TranscriptEvent};
use events::{ClientMessage, ServerMessage, WsSender, send_message};

use crate::state::AppState;
use crate::util::format_record_id;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioChannel {
    Operator = 0,
    Customer = 1,
}

impl TryFrom<u8> for AudioChannel {
    type Error = CallError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Operator),
            1 => Ok(Self::Customer),
            _ => Err(CallError::InvalidChannel(value)),
        }
    }
}

#[derive(Debug)]
pub struct AudioPacket {
    pub channel: AudioChannel,
    pub pcm: Vec<u8>,
}

struct UtteranceBuffer {
    content: String,
    interim: String,
}

pub struct Call {
    state: AppState,
    conversation_id: RecordId,
    ws_sender: WsSender,
    operator_session: SonioxSession,
    customer_session: SonioxSession,
    operator_utterance_rx: tokio::sync::Mutex<mpsc::Receiver<()>>,
    customer_utterance_rx: tokio::sync::Mutex<mpsc::Receiver<()>>,
    pending_pipelines: Arc<AtomicUsize>,
    pipeline_done: Arc<Notify>,
    operator_packets: AtomicUsize,
    customer_packets: AtomicUsize,
}

impl Call {
    pub async fn new(
        state: AppState,
        user_id: String,
        ws_sender: WsSender,
    ) -> Result<Self, CallError> {
        let conversation_id = create_conversation(&state.db, &user_id).await?;
        let _conv_id_str = format_record_id(&conversation_id);

        let pending_pipelines = Arc::new(AtomicUsize::new(0));
        let pipeline_done = Arc::new(Notify::new());

        let (op_utterance_tx, op_utterance_rx) = mpsc::channel(1);
        let operator_session = spawn_asr_handler(
            state.clone(),
            conversation_id.clone(),
            "operator",
            ws_sender.clone(),
            op_utterance_tx,
            None, // no pipeline for operator
        )
        .await?;

        let (cust_utterance_tx, cust_utterance_rx) = mpsc::channel(1);
        let customer_session = spawn_asr_handler(
            state.clone(),
            conversation_id.clone(),
            "customer",
            ws_sender.clone(),
            cust_utterance_tx,
            Some((pending_pipelines.clone(), pipeline_done.clone())),
        )
        .await?;

        Ok(Self {
            state,
            conversation_id,
            ws_sender,
            operator_session,
            customer_session,
            operator_utterance_rx: tokio::sync::Mutex::new(op_utterance_rx),
            customer_utterance_rx: tokio::sync::Mutex::new(cust_utterance_rx),
            pending_pipelines,
            pipeline_done,
            operator_packets: AtomicUsize::new(0),
            customer_packets: AtomicUsize::new(0),
        })
    }

    pub fn conversation_record_id(&self) -> &RecordId {
        &self.conversation_id
    }

    pub async fn handle_message(&self, msg: ClientMessage) -> Result<(), CallError> {
        match msg {
            ClientMessage::Message { content } => self.handle_operator_message(content).await,
        }
    }

    async fn handle_operator_message(&self, content: String) -> Result<(), CallError> {
        let event_id = create_event(
            &self.state.db,
            &self.conversation_id,
            "message",
            "operator",
            &content,
        )
        .await?;

        send_message(
            &self.ws_sender,
            ServerMessage::Message {
                id: format_record_id(&event_id),
                role: "operator".to_string(),
                content: content.clone(),
            },
        )
        .await;

        let state = self.state.clone();
        let conv_id = self.conversation_id.clone();
        let ws = self.ws_sender.clone();
        let pending = self.pending_pipelines.clone();
        let done = self.pipeline_done.clone();

        pending.fetch_add(1, Ordering::SeqCst);
        tokio::spawn(async move {
            if let Err(e) =
                intelligence::run_pipeline(&state, &conv_id, &event_id, &content, ws).await
            {
                tracing::error!(error = %e, "pipeline failed for operator message");
            }
            pending.fetch_sub(1, Ordering::SeqCst);
            done.notify_one();
        });

        Ok(())
    }

    pub async fn send_audio(&self, packet: AudioPacket) -> Result<(), CallError> {
        let (session, counter) = match packet.channel {
            AudioChannel::Operator => (&self.operator_session, &self.operator_packets),
            AudioChannel::Customer => (&self.customer_session, &self.customer_packets),
        };

        let count = counter.fetch_add(1, Ordering::Relaxed) + 1;
        if count % 200 == 0 {
            let (rms, peak) = audio_stats(&packet.pcm);
            tracing::debug!(
                channel = ?packet.channel,
                packets = count,
                bytes = packet.pcm.len(),
                rms = rms,
                peak = peak,
                "audio packets received"
            );
        }

        session
            .send_audio(&packet.pcm)
            .await
            .map_err(CallError::Asr)
    }

    pub async fn flush(&self) {
        let _ = self.operator_session.flush().await;
        let _ = self.customer_session.flush().await;

        let wait_utterances = async {
            let mut op_rx = self.operator_utterance_rx.lock().await;
            let mut cust_rx = self.customer_utterance_rx.lock().await;
            tokio::join!(op_rx.recv(), cust_rx.recv());
        };
        let _ = tokio::time::timeout(tokio::time::Duration::from_secs(3), wait_utterances).await;

        let wait_pipelines = async {
            while self.pending_pipelines.load(Ordering::SeqCst) > 0 {
                self.pipeline_done.notified().await;
            }
        };
        let _ = tokio::time::timeout(tokio::time::Duration::from_secs(30), wait_pipelines).await;

        let _ = self.operator_session.close().await;
        let _ = self.customer_session.close().await;
    }
}

fn audio_stats(pcm: &[u8]) -> (f32, f32) {
    if pcm.len() < 2 {
        return (0.0, 0.0);
    }

    let mut sum_squares = 0.0f64;
    let mut peak = 0.0f32;
    let mut samples = 0.0f64;

    for chunk in pcm.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / 32768.0;
        let abs = sample.abs();
        if abs > peak {
            peak = abs;
        }
        sum_squares += (sample as f64) * (sample as f64);
        samples += 1.0;
    }

    let rms = if samples > 0.0 {
        (sum_squares / samples).sqrt() as f32
    } else {
        0.0
    };

    (rms, peak)
}

async fn create_conversation(db: &Surreal<Any>, user_id: &str) -> Result<RecordId, CallError> {
    let mut result = db
        .query("CREATE conversations SET user = type::record('users', $id) RETURN id")
        .bind(("id", user_id.to_string()))
        .await
        .map_err(|e| CallError::Database(e.to_string()))?;

    result
        .take::<Option<RecordId>>("id")
        .map_err(|e| CallError::Database(e.to_string()))?
        .ok_or_else(|| CallError::Database("failed to create conversation".into()))
}

async fn create_event(
    db: &Surreal<Any>,
    conversation_id: &RecordId,
    kind: &str,
    role: &str,
    content: &str,
) -> Result<RecordId, CallError> {
    let mut result = db
        .query(
            "CREATE events SET \
                conversation = $conversation, \
                kind = $kind, \
                role = $role, \
                content = $content \
            RETURN id",
        )
        .bind(("conversation", conversation_id.clone()))
        .bind(("kind", kind.to_string()))
        .bind(("role", role.to_string()))
        .bind(("content", content.to_string()))
        .await
        .map_err(|e| CallError::Database(e.to_string()))?;

    result
        .take::<Option<RecordId>>("id")
        .map_err(|e| CallError::Database(e.to_string()))?
        .ok_or_else(|| CallError::Database("failed to create event".into()))
}

type PipelineInfo = (Arc<AtomicUsize>, Arc<Notify>);

async fn spawn_asr_handler(
    state: AppState,
    conversation_id: RecordId,
    role: &'static str,
    ws: WsSender,
    utterance_tx: mpsc::Sender<()>,
    pipeline_info: Option<PipelineInfo>,
) -> Result<SonioxSession, CallError> {
    let (tx, mut rx) = mpsc::unbounded_channel();

    let handler_state = state.clone();
    let handler_conv_id = conversation_id.clone();
    let handler_ws = ws.clone();

    tokio::spawn(async move {
        let mut buffer = UtteranceBuffer {
            content: String::new(),
            interim: String::new(),
        };
        let mut event_count: usize = 0;
        let mut word_count: usize = 0;
        let mut utterance_count: usize = 0;

        while let Some(event) = rx.recv().await {
            event_count += 1;
            match &event {
                TranscriptEvent::Word(_) => word_count += 1,
                TranscriptEvent::UtteranceEnd => utterance_count += 1,
            }

            if event_count % 50 == 0 {
                tracing::debug!(
                    role = role,
                    events = event_count,
                    words = word_count,
                    utterances = utterance_count,
                    "transcript events received"
                );
            }

            let is_utterance_end = matches!(event, TranscriptEvent::UtteranceEnd);
            let pending_content = if is_utterance_end && !buffer.content.trim().is_empty() {
                Some(buffer.content.clone())
            } else {
                None
            };

            let event_id = handle_transcript_event(
                &handler_state.db,
                &handler_ws,
                &handler_conv_id,
                role,
                &mut buffer,
                event,
            )
            .await;

            if let (Ok(Some(event_id)), Some(content), Some((pending, done))) =
                (event_id, pending_content, pipeline_info.as_ref())
            {
                let pipeline_state = handler_state.clone();
                let pipeline_conv_id = handler_conv_id.clone();
                let pipeline_ws = handler_ws.clone();
                let pending = pending.clone();
                let done = done.clone();

                pending.fetch_add(1, Ordering::SeqCst);
                tokio::spawn(async move {
                    if let Err(e) = intelligence::run_pipeline(
                        &pipeline_state,
                        &pipeline_conv_id,
                        &event_id,
                        &content,
                        pipeline_ws,
                    )
                    .await
                    {
                        tracing::error!(error = %e, "pipeline failed");
                    }
                    pending.fetch_sub(1, Ordering::SeqCst);
                    done.notify_one();
                });
            }

            if is_utterance_end {
                let _ = utterance_tx.send(()).await;
            }
        }
    });

    let tx_clone = tx.clone();
    SonioxSession::new(state.config.soniox_api_key.clone(), vec![], move |event| {
        let _ = tx_clone.send(event);
    })
    .await
    .map_err(CallError::Asr)
}

async fn handle_transcript_event(
    db: &Surreal<Any>,
    ws: &WsSender,
    conversation_id: &RecordId,
    role: &str,
    buffer: &mut UtteranceBuffer,
    event: TranscriptEvent,
) -> Result<Option<RecordId>, String> {
    match event {
        TranscriptEvent::Word(word) => {
            if word.is_final {
                if !buffer.content.is_empty() {
                    buffer.content.push(' ');
                }
                buffer.content.push_str(&word.text);
                buffer.interim.clear();

                send_message(
                    ws,
                    ServerMessage::InterimTranscript {
                        role: role.to_string(),
                        content: buffer.content.clone(),
                    },
                )
                .await;

                tracing::debug!(role = role, content = %buffer.content, "interim transcript")
            } else {
                if buffer.content.is_empty() {
                    buffer.interim = word.text.clone();
                } else {
                    buffer.interim = format!("{} {}", buffer.content, word.text);
                }

                send_message(
                    ws,
                    ServerMessage::InterimTranscript {
                        role: role.to_string(),
                        content: buffer.interim.clone(),
                    },
                )
                .await;

                tracing::debug!(role = role, content = %buffer.interim, "interim transcript")
            }
            Ok(None)
        }
        TranscriptEvent::UtteranceEnd => {
            let utterance_text = if buffer.content.is_empty() {
                buffer.interim.trim().to_string()
            } else {
                buffer.content.clone()
            };

            if utterance_text.is_empty() {
                return Ok(None);
            }

            let mut result = db
                .query(
                    "CREATE events SET \
                        conversation = $conversation, \
                        kind = 'utterance', \
                        role = $role, \
                        content = $content \
                    RETURN id",
                )
                .bind(("conversation", conversation_id.clone()))
                .bind(("role", role.to_string()))
                .bind(("content", utterance_text.clone()))
                .await
                .map_err(|e| e.to_string())?;

            let event_id: Option<RecordId> = result.take("id").map_err(|e| e.to_string())?;
            let event_id = event_id.ok_or("no event ID returned")?;

            send_message(
                ws,
                ServerMessage::Utterance {
                    id: format_record_id(&event_id),
                    role: role.to_string(),
                    content: utterance_text.clone(),
                },
            )
            .await;

            tracing::info!(role = role, content = %utterance_text, "utterance final");

            buffer.content.clear();
            buffer.interim.clear();
            Ok(Some(event_id))
        }
    }
}

#[derive(Debug, Error)]
pub enum CallError {
    #[error("ASR error: {0}")]
    Asr(String),
    #[error("invalid audio channel: {0}")]
    InvalidChannel(u8),
    #[error("database error: {0}")]
    Database(String),
}
