use eframe::egui;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::mpsc::{self, SyncSender, TrySendError};
use std::thread::JoinHandle;

const REMOTE_STREAM: bool = false;
const REMOTE_ENDPOINT: &str = "https://example.com/audio-stream";
const LOCAL_OUTPUT_FILE: &str = "output.wav";

struct AppState {
    is_recording: bool,
    stream: Option<cpal::Stream>,
    sample_tx: Option<SyncSender<Vec<f32>>>,
    worker: Option<JoinHandle<()>>,
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions::default();
    
    let mut app_state = AppState {
        is_recording: false,
        stream: None,
        sample_tx: None,
        worker: None,
    };

    eframe::run_simple_native("AZOR", options, move |ctx, _frame| {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("AZOR Service Connector");
            
            let button_text = if app_state.is_recording {
                "Stop Recording Loopback"
            } else {
                "Start Recording Loopback"
            };

            if ui.button(button_text).clicked() {
                if app_state.is_recording {
                    println!("Stopping AZOR service connection...");

                    app_state.stream = None;
                    app_state.sample_tx = None;
                    if let Some(worker) = app_state.worker.take() {
                        if let Err(err) = worker.join() {
                            eprintln!("Audio sink worker panicked: {:?}", err);
                        }
                    }

                    app_state.is_recording = false;
                } else {
                    println!("Starting AZOR service connection...");
                    
                    match start_loopback_recording() {
                        Ok((stream, sample_tx, worker)) => {
                            app_state.stream = Some(stream);
                            app_state.sample_tx = Some(sample_tx);
                            app_state.worker = Some(worker);
                            app_state.is_recording = true;
                        }
                        Err(e) => eprintln!("Failed to start recording: {}", e),
                    }
                }
            }
        });
    })
}

fn start_loopback_recording() -> Result<(cpal::Stream, SyncSender<Vec<f32>>, JoinHandle<()>), Box<dyn std::error::Error>> {
    let host = cpal::default_host();
    
    let device = host.default_output_device().ok_or("No output device found")?;
    let supported_config = device.default_output_config()?;
    let stream_config: cpal::StreamConfig = supported_config.clone().into();

    let (sample_tx, sample_rx) = mpsc::sync_channel::<Vec<f32>>(64);
    let sample_rate = stream_config.sample_rate.0;
    let channels = stream_config.channels;

    let worker = if REMOTE_STREAM {
        println!("Streaming audio chunks to remote endpoint: {}", REMOTE_ENDPOINT);
        std::thread::spawn(move || stream_to_remote_endpoint(sample_rx, sample_rate, channels))
    } else {
        println!("Recording audio locally to {}", LOCAL_OUTPUT_FILE);
        std::thread::spawn(move || write_to_local_wav(sample_rx, sample_rate, channels))
    };

    let tx_for_callback = sample_tx.clone();

    let stream = match supported_config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &_| push_chunk(&tx_for_callback, data.to_vec()),
            |err| eprintln!("Audio stream error: {}", err),
            None,
        )?,
        cpal::SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _: &_| {
                let chunk = data
                    .iter()
                    .map(|&s| (s as f32) / (i16::MAX as f32))
                    .collect::<Vec<f32>>();
                push_chunk(&tx_for_callback, chunk);
            },
            |err| eprintln!("Audio stream error: {}", err),
            None,
        )?,
        cpal::SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _: &_| {
                let chunk = data
                    .iter()
                    .map(|&s| ((s as f32) / (u16::MAX as f32)) * 2.0 - 1.0)
                    .collect::<Vec<f32>>();
                push_chunk(&tx_for_callback, chunk);
            },
            |err| eprintln!("Audio stream error: {}", err),
            None,
        )?,
        sample_format => {
            return Err(format!("Unsupported sample format: {:?}", sample_format).into());
        }
    };

    stream.play()?;

    Ok((stream, sample_tx, worker))
}

fn push_chunk(sample_tx: &SyncSender<Vec<f32>>, chunk: Vec<f32>) {
    if let Err(err) = sample_tx.try_send(chunk) {
        match err {
            TrySendError::Full(_) => {}
            TrySendError::Disconnected(_) => {}
        }
    }
}

fn write_to_local_wav(sample_rx: mpsc::Receiver<Vec<f32>>, sample_rate: u32, channels: u16) {
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let mut writer = match hound::WavWriter::create(LOCAL_OUTPUT_FILE, spec) {
        Ok(writer) => writer,
        Err(err) => {
            eprintln!("Failed to create WAV file {}: {}", LOCAL_OUTPUT_FILE, err);
            return;
        }
    };

    for chunk in sample_rx {
        for sample in chunk {
            if let Err(err) = writer.write_sample(sample) {
                eprintln!("Failed writing WAV sample: {}", err);
                return;
            }
        }
    }

    if let Err(err) = writer.finalize() {
        eprintln!("Failed to finalize WAV file: {}", err);
    } else {
        println!("Audio saved to {}", LOCAL_OUTPUT_FILE);
    }
}

fn stream_to_remote_endpoint(sample_rx: mpsc::Receiver<Vec<f32>>, sample_rate: u32, channels: u16) {
    let client = reqwest::blocking::Client::new();

    for chunk in sample_rx {
        let mut bytes = Vec::with_capacity(chunk.len() * std::mem::size_of::<f32>());
        for sample in chunk {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }

        let response = client
            .post(REMOTE_ENDPOINT)
            .header("Content-Type", "application/octet-stream")
            .header("X-Sample-Format", "f32le")
            .header("X-Sample-Rate", sample_rate.to_string())
            .header("X-Channels", channels.to_string())
            .body(bytes)
            .send();

        if let Err(err) = response {
            eprintln!("Failed to send audio chunk to endpoint: {}", err);
        }
    }
}