pub mod asr;

use surrealdb::Surreal;
use surrealdb::engine::any::Any;
use surrealdb::types::RecordId;
use thiserror::Error;
use tokio::sync::mpsc;

use crate::state::AppState;
use asr::{SonioxSession, TranscriptEvent};

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

struct ChannelState {
    message_id: Option<RecordId>,
    content: String,
}

pub struct Call {
    operator_session: SonioxSession,
    customer_session: SonioxSession,
    operator_utterance_rx: tokio::sync::Mutex<tokio::sync::mpsc::Receiver<()>>,
    customer_utterance_rx: tokio::sync::Mutex<tokio::sync::mpsc::Receiver<()>>,
}

impl Call {
    pub async fn new(state: AppState, user_id: String) -> Result<Self, CallError> {
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
        let db = state.db.clone();

        // Channel for operator events
        let (op_tx, mut op_rx) = mpsc::unbounded_channel();
        let (op_utterance_tx, op_utterance_rx) = mpsc::channel(1);
        let op_db = db.clone();
        let op_conv_id = conversation_id.clone();
        tokio::spawn(async move {
            let mut state = ChannelState {
                message_id: None,
                content: String::new(),
            };
            while let Some(event) = op_rx.recv().await {
                let is_utterance_end = matches!(event, TranscriptEvent::UtteranceEnd);
                if let Err(e) = Self::handle_transcript_event(
                    &op_db,
                    &op_conv_id,
                    "operator",
                    &mut state,
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

        // Channel for customer events
        let (cust_tx, mut cust_rx) = mpsc::unbounded_channel();
        let (cust_utterance_tx, cust_utterance_rx) = mpsc::channel(1);
        let cust_db = db.clone();
        let cust_conv_id = conversation_id.clone();
        tokio::spawn(async move {
            let mut state = ChannelState {
                message_id: None,
                content: String::new(),
            };
            while let Some(event) = cust_rx.recv().await {
                let is_utterance_end = matches!(event, TranscriptEvent::UtteranceEnd);
                if let Err(e) = Self::handle_transcript_event(
                    &cust_db,
                    &cust_conv_id,
                    "customer",
                    &mut state,
                    event,
                )
                .await
                {
                    tracing::error!("Failed to handle customer transcript event: {}", e);
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
            operator_session,
            customer_session,
            operator_utterance_rx: tokio::sync::Mutex::new(op_utterance_rx),
            customer_utterance_rx: tokio::sync::Mutex::new(cust_utterance_rx),
        })
    }

    async fn handle_transcript_event(
        db: &Surreal<Any>,
        conversation_id: &RecordId,
        role: &str,
        state: &mut ChannelState,
        event: TranscriptEvent,
    ) -> Result<(), String> {
        match event {
            TranscriptEvent::Word(word) => {
                if word.is_final {
                    // Add space before word (except for the first word)
                    if !state.content.is_empty() {
                        state.content.push(' ');
                    }

                    state.content.push_str(&word.text);

                    if let Some(ref id) = state.message_id {
                        // Update existing message
                        db.query("UPDATE $msg SET content = $content, updated_at = time::now()")
                            .bind(("msg", id.clone()))
                            .bind(("content", state.content.clone()))
                            .await
                            .map_err(|e| format!("Failed to update message: {}", e))?;
                    } else {
                        // Create new message
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
                            .bind(("content", state.content.clone()))
                            .await
                            .map_err(|e| format!("Failed to create message: {}", e))?;

                        let id: Option<RecordId> = result
                            .take("id")
                            .map_err(|e| format!("Failed to parse message ID: {}", e))?;
                        state.message_id = id;
                    }
                }
            }
            TranscriptEvent::UtteranceEnd => {
                // Clear state for next utterance
                state.message_id = None;
                state.content.clear();
            }
        }
        Ok(())
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
        // Send empty frames to finalize audio processing
        // Soniox will process remaining audio and send final transcripts + UtteranceEnd
        let _ = self.operator_session.flush().await;
        let _ = self.customer_session.flush().await;

        // Wait for both channels to receive their UtteranceEnd events (with timeout)
        let wait_for_utterance_ends = async {
            let mut op_rx = self.operator_utterance_rx.lock().await;
            let mut cust_rx = self.customer_utterance_rx.lock().await;
            tokio::join!(op_rx.recv(), cust_rx.recv());
        };

        // Wait up to 3 seconds for final transcripts to be processed and saved
        let _ = tokio::time::timeout(tokio::time::Duration::from_secs(3), wait_for_utterance_ends)
            .await;

        // Close the WebSocket connections gracefully
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
