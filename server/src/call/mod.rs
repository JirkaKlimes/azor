pub mod asr;

use thiserror::Error;

use crate::state::AppState;
use asr::{SonioxSession, TranscriptEvent};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioChannel {
    Mic = 0,
    ScreenCapture = 1,
}

impl TryFrom<u8> for AudioChannel {
    type Error = CallError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Mic),
            1 => Ok(Self::ScreenCapture),
            _ => Err(CallError::InvalidChannel(value)),
        }
    }
}

#[derive(Debug)]
pub struct AudioPacket {
    pub channel: AudioChannel,
    pub pcm: Vec<u8>,
}

pub struct Call {
    mic_session: SonioxSession,
    screen_session: SonioxSession,
}

impl Call {
    pub async fn new(state: AppState) -> Result<Self, CallError> {
        let api_key = state.config.soniox_api_key.clone();

        let mic_session = SonioxSession::new(api_key.clone(), vec![], |event| match event {
            TranscriptEvent::Word(word) => {
                if word.is_final {
                    tracing::info!(
                        channel = "mic",
                        text = %word.text,
                        start_ms = word.start.as_millis(),
                        end_ms = word.end.as_millis(),
                        confidence = word.confidence,
                        "Transcript word"
                    );
                }
            }
            TranscriptEvent::UtteranceEnd => {
                tracing::info!(channel = "mic", "Utterance end");
            }
        })
        .await
        .map_err(CallError::Asr)?;

        let screen_session = SonioxSession::new(api_key, vec![], |event| match event {
            TranscriptEvent::Word(word) => {
                if word.is_final {
                    tracing::info!(
                        channel = "screen",
                        text = %word.text,
                        start_ms = word.start.as_millis(),
                        end_ms = word.end.as_millis(),
                        confidence = word.confidence,
                        "Transcript word"
                    );
                }
            }
            TranscriptEvent::UtteranceEnd => {
                tracing::info!(channel = "screen", "Utterance end");
            }
        })
        .await
        .map_err(CallError::Asr)?;

        Ok(Self {
            mic_session,
            screen_session,
        })
    }

    pub async fn send_audio(&self, packet: AudioPacket) -> Result<(), CallError> {
        let session = match packet.channel {
            AudioChannel::Mic => &self.mic_session,
            AudioChannel::ScreenCapture => &self.screen_session,
        };

        session
            .send_audio(&packet.pcm)
            .await
            .map_err(CallError::Asr)
    }
}

#[derive(Debug, Error)]
pub enum CallError {
    #[error("ASR error: {0}")]
    Asr(String),
    #[error("Invalid audio channel: {0}")]
    InvalidChannel(u8),
    #[error("Invalid audio format: {0}")]
    InvalidAudioFormat(String),
}
