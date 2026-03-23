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

use crate::state::AppState;
use crate::util::format_record_id;
use asr::{SonioxSession, TranscriptEvent};
use events::{ServerMessage, WsSender, send_message};

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

/// State for accumulating transcript within an utterance.
/// No message_id here - we only persist at utterance end.
struct ChannelState {
    content: String,
}

pub struct Call {
    conversation_id: String,
    operator_session: SonioxSession,
    customer_session: SonioxSession,
    operator_utterance_rx: tokio::sync::Mutex<tokio::sync::mpsc::Receiver<()>>,
    customer_utterance_rx: tokio::sync::Mutex<tokio::sync::mpsc::Receiver<()>>,
    pending_pipelines: Arc<AtomicUsize>,
    pipeline_done: Arc<Notify>,
}

impl Call {
    pub async fn new(
        state: AppState,
        user_id: String,
        ws_sender: WsSender,
    ) -> Result<Self, CallError> {
        // Create call record
        let mut result = state
            .db
            .query(
                "CREATE calls SET user = type::record('users', $id), start = time::now() RETURN id",
            )
            .bind(("id", user_id))
            .await
            .map_err(|e| CallError::Database(e.to_string()))?;

        let call_id: Option<RecordId> = result
            .take("id")
            .map_err(|e| CallError::Database(e.to_string()))?;
        let call_id = call_id.ok_or_else(|| CallError::Database("failed to create call".into()))?;

        // Create conversation linked to this call
        let mut result = state
            .db
            .query("CREATE conversations SET call = $call, status = 'active' RETURN id")
            .bind(("call", call_id))
            .await
            .map_err(|e| CallError::Database(e.to_string()))?;

        let conversation_id: Option<RecordId> = result
            .take("id")
            .map_err(|e| CallError::Database(e.to_string()))?;
        let conversation_id = conversation_id
            .ok_or_else(|| CallError::Database("failed to create conversation".into()))?;

        let api_key = state.config.soniox_api_key.clone();
        let conv_id_str = format_record_id(&conversation_id);

        // Channel for operator events
        let (op_tx, mut op_rx) = mpsc::unbounded_channel();
        let (op_utterance_tx, op_utterance_rx) = mpsc::channel(1);
        let op_db = state.db.clone();
        let op_conv_id = conversation_id.clone();
        let op_conv_id_str = conv_id_str.clone();
        let op_ws = ws_sender.clone();

        tokio::spawn(async move {
            let mut channel_state = ChannelState {
                content: String::new(),
            };
            while let Some(event) = op_rx.recv().await {
                let is_utterance_end = matches!(event, TranscriptEvent::UtteranceEnd);

                if let Err(e) = Self::handle_transcript_event(
                    &op_db,
                    &op_ws,
                    &op_conv_id,
                    &op_conv_id_str,
                    "operator",
                    &mut channel_state,
                    event,
                )
                .await
                {
                    tracing::error!("Failed to handle operator transcript event: {}", e);
                }

                if is_utterance_end {
                    let _ = op_utterance_tx.send(()).await;
                }
            }
        });

        let op_tx_clone = op_tx.clone();
        let operator_session = SonioxSession::new(api_key.clone(), vec![], move |event| {
            let _ = op_tx_clone.send(event);
        })
        .await
        .map_err(CallError::Asr)?;

        // Channel for customer events (with intelligence pipeline)
        let (cust_tx, mut cust_rx) = mpsc::unbounded_channel();
        let (cust_utterance_tx, cust_utterance_rx) = mpsc::channel(1);
        let cust_state = state.clone();
        let cust_conv_id = conversation_id.clone();
        let cust_conv_id_str = conv_id_str.clone();
        let cust_ws = ws_sender.clone();

        let pending_pipelines = Arc::new(AtomicUsize::new(0));
        let pipeline_done = Arc::new(Notify::new());
        let pending_pipelines_clone = pending_pipelines.clone();
        let pipeline_done_clone = pipeline_done.clone();

        tokio::spawn(async move {
            let mut channel_state = ChannelState {
                content: String::new(),
            };
            while let Some(event) = cust_rx.recv().await {
                let is_utterance_end = matches!(event, TranscriptEvent::UtteranceEnd);

                let pending_content =
                    if is_utterance_end && !channel_state.content.trim().is_empty() {
                        Some(channel_state.content.clone())
                    } else {
                        None
                    };

                let message_id = Self::handle_transcript_event(
                    &cust_state.db,
                    &cust_ws,
                    &cust_conv_id,
                    &cust_conv_id_str,
                    "customer",
                    &mut channel_state,
                    event,
                )
                .await;

                if let (Ok(Some(msg_id)), Some(content)) = (message_id, pending_content) {
                    let pipeline_state = cust_state.clone();
                    let pipeline_conv_id = cust_conv_id.clone();
                    let pipeline_ws = cust_ws.clone();
                    let pending = pending_pipelines_clone.clone();
                    let done = pipeline_done_clone.clone();

                    pending.fetch_add(1, Ordering::SeqCst);

                    tokio::spawn(async move {
                        if let Err(e) = intelligence::run_pipeline(
                            &pipeline_state,
                            &pipeline_conv_id,
                            &msg_id,
                            &content,
                            pipeline_ws,
                        )
                        .await
                        {
                            tracing::error!("Intelligence pipeline failed: {}", e);
                        }
                        pending.fetch_sub(1, Ordering::SeqCst);
                        done.notify_one();
                    });
                }

                if is_utterance_end {
                    let _ = cust_utterance_tx.send(()).await;
                }
            }
        });

        let cust_tx_clone = cust_tx.clone();
        let customer_session = SonioxSession::new(api_key, vec![], move |event| {
            let _ = cust_tx_clone.send(event);
        })
        .await
        .map_err(CallError::Asr)?;

        Ok(Self {
            conversation_id: conv_id_str,
            operator_session,
            customer_session,
            operator_utterance_rx: tokio::sync::Mutex::new(op_utterance_rx),
            customer_utterance_rx: tokio::sync::Mutex::new(cust_utterance_rx),
            pending_pipelines,
            pipeline_done,
        })
    }

    /// Get the conversation ID for this call
    pub fn conversation_id(&self) -> &str {
        &self.conversation_id
    }

    /// Handle a transcript event.
    /// - Word events: accumulate content, emit InterimTranscript (NOT persisted)
    /// - UtteranceEnd: persist single message to DB, emit FinalTranscript, return message_id
    async fn handle_transcript_event(
        db: &Surreal<Any>,
        ws: &WsSender,
        conversation_id: &RecordId,
        _conv_id_str: &str,
        role: &str,
        channel_state: &mut ChannelState,
        event: TranscriptEvent,
    ) -> Result<Option<RecordId>, String> {
        match event {
            TranscriptEvent::Word(word) => {
                if word.is_final {
                    // Add space before word (except for the first word)
                    if !channel_state.content.is_empty() {
                        channel_state.content.push(' ');
                    }
                    channel_state.content.push_str(&word.text);

                    // Emit interim transcript (NOT persisted)
                    send_message(
                        ws,
                        ServerMessage::InterimTranscript {
                            role: role.to_string(),
                            content: channel_state.content.clone(),
                        },
                    )
                    .await;
                }
                Ok(None)
            }
            TranscriptEvent::UtteranceEnd => {
                if channel_state.content.is_empty() {
                    return Ok(None);
                }

                // Create message in DB (single INSERT)
                let mut result = db
                    .query(
                        "CREATE messages SET \
                            conversation = $conversation, \
                            role = $role, \
                            content = $content \
                        RETURN id",
                    )
                    .bind(("conversation", conversation_id.clone()))
                    .bind(("role", role.to_string()))
                    .bind(("content", channel_state.content.clone()))
                    .await
                    .map_err(|e| format!("Failed to create message: {}", e))?;

                let msg_id: Option<RecordId> = result
                    .take("id")
                    .map_err(|e| format!("Failed to parse message ID: {}", e))?;

                let msg_id = msg_id.ok_or_else(|| "No message ID returned".to_string())?;

                // Emit final transcript
                send_message(
                    ws,
                    ServerMessage::FinalTranscript {
                        id: format_record_id(&msg_id),
                        role: role.to_string(),
                        content: channel_state.content.clone(),
                    },
                )
                .await;

                // Clear state for next utterance
                let returned_id = msg_id.clone();
                channel_state.content.clear();

                Ok(Some(returned_id))
            }
        }
    }

    pub async fn send_audio(&self, packet: AudioPacket) -> Result<(), CallError> {
        let session = match packet.channel {
            AudioChannel::Operator => &self.operator_session,
            AudioChannel::Customer => &self.customer_session,
        };

        session
            .send_audio(&packet.pcm)
            .await
            .map_err(CallError::Asr)
    }

    /// Flush any pending audio and close the ASR sessions
    pub async fn flush(&self) {
        let _ = self.operator_session.flush().await;
        let _ = self.customer_session.flush().await;

        // Wait for UtteranceEnd events to be processed
        let wait_for_utterance_ends = async {
            let mut op_rx = self.operator_utterance_rx.lock().await;
            let mut cust_rx = self.customer_utterance_rx.lock().await;
            tokio::join!(op_rx.recv(), cust_rx.recv());
        };
        let _ = tokio::time::timeout(tokio::time::Duration::from_secs(3), wait_for_utterance_ends)
            .await;

        // Wait for all intelligence pipelines to complete
        let wait_for_pipelines = async {
            while self.pending_pipelines.load(Ordering::SeqCst) > 0 {
                self.pipeline_done.notified().await;
            }
        };
        let _ =
            tokio::time::timeout(tokio::time::Duration::from_secs(10), wait_for_pipelines).await;

        let _ = self.operator_session.close().await;
        let _ = self.customer_session.close().await;
    }
}

#[derive(Debug, Error)]
pub enum CallError {
    #[error("ASR error: {0}")]
    Asr(String),
    #[error("Invalid audio channel: {0}")]
    InvalidChannel(u8),
    #[error("Database error: {0}")]
    Database(String),
}
