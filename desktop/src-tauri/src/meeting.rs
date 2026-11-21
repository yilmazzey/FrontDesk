//! Local meeting notes.
//!
//! The microphone is captured with `cpal`, resampled to 16 kHz mono and written
//! as a small WAV. Whisper then runs locally, and the existing local model turns
//! the transcript into notes. Audio is temporary and is deleted after a
//! successful transcription.

use std::fs::{self, File};
use std::io::{BufWriter, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use chrono::{DateTime, Local};
use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::model;
use crate::state::AppState;

const MODEL_FILE: &str = "ggml-base-q5_1.bin";
const MODEL_SIZE_MB: u64 = 57;
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin";
const SAMPLE_RATE: u32 = 16_000;
const CHUNK_SECONDS: usize = 300;
const CHUNK_SAMPLES: usize = SAMPLE_RATE as usize * CHUNK_SECONDS;
const MAX_SUMMARY_CHARS: usize = 14_000;

const SUMMARY_SYSTEM: &str = "You are FrontDesk, a local-first meeting note taker. Use only the transcript. Never invent a decision, owner or date. If an owner or date is unclear, write \"unassigned\" or \"no date\". Reply in concise Markdown.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingStarted {
    pub id: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingStopped {
    pub id: String,
    pub duration_sec: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRecord {
    pub id: String,
    pub title: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_sec: f64,
    pub status: String,
    pub transcript: String,
    pub notes: String,
    pub model: Option<String>,
    pub saved_path: Option<String>,
    pub error: Option<String>,
    pub audio_deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSummary {
    pub id: String,
    pub title: String,
    pub started_at: String,
    pub duration_sec: f64,
    pub status: String,
    pub excerpt: String,
    pub model: Option<String>,
    pub saved_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingStatus {
    pub recording: bool,
    pub active_id: Option<String>,
    pub started_at: Option<String>,
    pub processing_id: Option<String>,
    pub phase: String,
    pub model_installed: bool,
    pub model_size_mb: u64,
    pub model_path: String,
    pub mic_available: bool,
    pub llm_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingProgress {
    pub id: String,
    pub kind: String,
    pub phase: String,
    pub percent: Option<u8>,
    pub message: String,
}

struct Recording {
    id: String,
    started_at: String,
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
    error: Arc<Mutex<Option<String>>>,
    audio_path: PathBuf,
}

#[derive(Default)]
struct Runtime {
    recording: Option<Recording>,
    processing: Option<String>,
    phase: Option<String>,
}

pub struct MeetingState {
    runtime: Mutex<Runtime>,
    downloading: AtomicBool,
}

impl Default for MeetingState {
    fn default() -> Self {
        Self {
            runtime: Mutex::new(Runtime::default()),
            downloading: AtomicBool::new(false),
        }
    }
}

impl MeetingState {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Runtime>, String> {
        self.runtime
            .lock()
            .map_err(|_| "The meeting recorder is busy. Restart FrontDesk.".to_string())
    }

    fn begin_process(&self, id: &str) -> Result<(), String> {
        let mut runtime = self.lock()?;
        if runtime.recording.is_some() {
            return Err("Stop the current recording first.".into());
        }
        if let Some(current) = &runtime.processing {
            if current != id {
                return Err("Another meeting is already being transcribed.".into());
            }
        }
        runtime.processing = Some(id.to_string());
        runtime.phase = Some("transcribing".into());
        Ok(())
    }

    fn set_phase(&self, phase: &str) {
        if let Ok(mut runtime) = self.runtime.lock() {
            runtime.phase = Some(phase.to_string());
        }
    }

    fn finish_process(&self) {
        if let Ok(mut runtime) = self.runtime.lock() {
            runtime.processing = None;
            runtime.phase = None;
        }
    }
}

fn meetings_root(data_dir: &Path) -> PathBuf {
    data_dir.join("meetings")
}

fn meeting_dir(data_dir: &Path, id: &str) -> PathBuf {
    meetings_root(data_dir).join(id)
}

fn model_path(data_dir: &Path) -> PathBuf {
    data_dir.join("whisper").join(MODEL_FILE)
}

fn valid_model(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if metadata.len() < 40 * 1024 * 1024 {
        return false;
    }
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let mut magic = [0u8; 4];
    if file.read_exact(&mut magic).is_err() {
        return false;
    }
    matches!(
        &magic,
        b"ggml" | b"lmgg" | b"GGUF" | b"ggmf" | b"fmgg" | b"FUGU"
    )
}

fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
}

fn display_title(started_at: &str) -> String {
    match DateTime::parse_from_rfc3339(started_at) {
        Ok(value) => format!(
            "Meeting — {}",
            value.with_timezone(&Local).format("%a %d %b, %H:%M")
        ),
        Err(_) => "Meeting".to_string(),
    }
}

fn read_record(dir: &Path) -> Result<MeetingRecord, String> {
    let path = dir.join("meeting.json");
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the meeting: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Could not parse the meeting: {error}"))
}

fn write_record(dir: &Path, record: &MeetingRecord) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|error| format!("Could not create the meeting folder: {error}"))?;
    let raw = serde_json::to_string_pretty(record)
        .map_err(|error| format!("Could not serialise the meeting: {error}"))?;
    fs::write(dir.join("meeting.json"), raw)
        .map_err(|error| format!("Could not save the meeting: {error}"))?;
    let transcript = if record.transcript.trim().is_empty() {
        "Transcript is still being prepared."
    } else {
        record.transcript.trim()
    };
    let _ = fs::write(dir.join("transcript.txt"), format!("{transcript}\n"));
    if !record.notes.trim().is_empty() {
        let _ = fs::write(
            dir.join("notes.md"),
            format!("# {}\n\n{}\n", record.title, record.notes.trim()),
        );
    }
    Ok(())
}

fn summary_of(record: &MeetingRecord) -> MeetingSummary {
    let source = if record.notes.trim().is_empty() {
        record.transcript.trim()
    } else {
        record.notes.trim()
    };
    let excerpt: String = source.split_whitespace().collect::<Vec<_>>().join(" ");
    MeetingSummary {
        id: record.id.clone(),
        title: record.title.clone(),
        started_at: record.started_at.clone(),
        duration_sec: record.duration_sec,
        status: record.status.clone(),
        excerpt: excerpt.chars().take(190).collect(),
        model: record.model.clone(),
        saved_path: record.saved_path.clone(),
    }
}

fn emit(
    app: &AppHandle,
    id: &str,
    kind: &str,
    phase: &str,
    percent: Option<u8>,
    message: &str,
) {
    let _ = app.emit(
        "meeting-progress",
        MeetingProgress {
            id: id.to_string(),
            kind: kind.to_string(),
            phase: phase.to_string(),
            percent,
            message: message.to_string(),
        },
    );
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

struct MonoResampler {
    step: f64,
    position: f64,
}

impl MonoResampler {
    fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            step: input_rate.max(1) as f64 / output_rate.max(1) as f64,
            position: 0.0,
        }
    }

    fn push(&mut self, sample: f32, output: &mut Vec<f32>) {
        self.position += 1.0;
        while self.position >= self.step {
            output.push(sample);
            self.position -= self.step;
        }
    }
}

type Writer = hound::WavWriter<BufWriter<File>>;

fn write_samples(writer: &Arc<Mutex<Option<Writer>>>, samples: &[f32]) {
    let Ok(mut guard) = writer.lock() else {
        return;
    };
    let Some(writer) = guard.as_mut() else {
        return;
    };
    for sample in samples {
        let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        let _ = writer.write_sample(value);
    }
}

fn build_stream<T, F>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    writer: Arc<Mutex<Option<Writer>>>,
    error: Arc<Mutex<Option<String>>>,
    input_rate: u32,
    channels: usize,
    convert: F,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample,
    F: Fn(T) -> f32 + Send + 'static,
{
    let mut resampler = MonoResampler::new(input_rate, SAMPLE_RATE);
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                let mut mono = Vec::with_capacity(data.len().max(1));
                for frame in data.chunks_exact(channels.max(1)) {
                    let sum: f32 = frame.iter().map(|sample| convert(*sample)).sum();
                    resampler.push(sum / channels.max(1) as f32, &mut mono);
                }
                write_samples(&writer, &mono);
            },
            move |stream_error| {
                if let Ok(mut slot) = error.lock() {
                    *slot = Some(stream_error.to_string());
                }
            },
            None,
        )
        .map_err(|stream_error| format!("Could not open the microphone: {stream_error}"))
}

fn record_microphone(path: &Path, stop: Arc<AtomicBool>) -> Result<(), String> {
    use cpal::traits::StreamTrait;

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone is available. Connect one and try again.".to_string())?;
    let supported = device
        .default_input_config()
        .map_err(|error| format!("Could not read the microphone settings: {error}"))?;
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.config();
    let channels = config.channels as usize;
    let input_rate = config.sample_rate.0;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create the recording folder: {error}"))?;
    }
    let file = File::create(path).map_err(|error| format!("Could not start the recording: {error}"))?;
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let writer = hound::WavWriter::new(BufWriter::new(file), spec)
        .map_err(|error| format!("Could not write the recording: {error}"))?;
    let writer = Arc::new(Mutex::new(Some(writer)));
    let error = Arc::new(Mutex::new(None));

    let stream = match sample_format {
        cpal::SampleFormat::F32 => build_stream::<f32, _>(
            &device,
            &config,
            writer.clone(),
            error.clone(),
            input_rate,
            channels,
            |sample| sample,
        )?,
        cpal::SampleFormat::I16 => build_stream::<i16, _>(
            &device,
            &config,
            writer.clone(),
            error.clone(),
            input_rate,
            channels,
            |sample| sample as f32 / 32_768.0,
        )?,
        cpal::SampleFormat::U16 => build_stream::<u16, _>(
            &device,
            &config,
            writer.clone(),
            error.clone(),
            input_rate,
            channels,
            |sample| (sample as f32 / 32_768.0) - 1.0,
        )?,
        other => {
            return Err(format!(
                "The microphone uses an unsupported format ({other:?}). Choose another input in System Settings."
            ))
        }
    };

    stream
        .play()
        .map_err(|error| format!("Could not start listening: {error}"))?;
    while !stop.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(100));
    }
    drop(stream);

    if let Ok(mut guard) = writer.lock() {
        if let Some(writer) = guard.take() {
            writer
                .finalize()
                .map_err(|error| format!("Could not finish the recording: {error}"))?;
        }
    }
    if let Ok(mut slot) = error.lock() {
        if let Some(message) = slot.take() {
            return Err(message);
        }
    }
    Ok(())
}

fn wav_duration(path: &Path) -> Result<f64, String> {
    let reader = hound::WavReader::open(path)
        .map_err(|error| format!("Could not read the recording: {error}"))?;
    let spec = reader.spec();
    Ok(reader.len() as f64 / spec.channels.max(1) as f64 / spec.sample_rate.max(1) as f64)
}

#[tauri::command]
pub fn meeting_start(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<MeetingStarted, String> {
    let model = model_path(&state.data_dir);
    if !valid_model(&model) {
        return Err("Install the local transcription model first.".into());
    }
    if cpal::default_host().default_input_device().is_none() {
        return Err("No microphone is available. Connect one and try again.".into());
    }

    let id = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let started_at = Local::now().to_rfc3339();
    let dir = meeting_dir(&state.data_dir, &id);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create the meeting folder: {error}"))?;
    let audio_path = dir.join("audio.wav");

    let mut runtime = state.meetings.lock()?;
    if runtime.recording.is_some() {
        return Err("FrontDesk is already recording a meeting.".into());
    }
    if runtime.processing.is_some() {
        return Err("Wait for the current meeting to finish transcribing.".into());
    }

    let record = MeetingRecord {
        id: id.clone(),
        title: display_title(&started_at),
        started_at: started_at.clone(),
        ended_at: None,
        duration_sec: 0.0,
        status: "recording".into(),
        transcript: String::new(),
        notes: String::new(),
        model: None,
        saved_path: None,
        error: None,
        audio_deleted: false,
    };
    write_record(&dir, &record)?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = stop.clone();
    let error = Arc::new(Mutex::new(None));
    let error_for_thread = error.clone();
    let audio_for_thread = audio_path.clone();
    let handle = thread::spawn(move || {
        if let Err(message) = record_microphone(&audio_for_thread, stop_for_thread) {
            if let Ok(mut slot) = error_for_thread.lock() {
                *slot = Some(message);
            }
        }
    });

    runtime.recording = Some(Recording {
        id: id.clone(),
        started_at: started_at.clone(),
        stop,
        handle: Some(handle),
        error,
        audio_path,
    });
    runtime.phase = Some("recording".into());
    drop(runtime);

    emit(&app, &id, "recording", "recording", None, "Listening on the microphone");
    Ok(MeetingStarted { id, started_at })
}

#[tauri::command]
pub fn meeting_stop(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<MeetingStopped, String> {
    let mut runtime = state.meetings.lock()?;
    let Some(mut recording) = runtime.recording.take() else {
        return Err("FrontDesk is not recording.".into());
    };
    drop(runtime);

    recording.stop.store(true, Ordering::SeqCst);
    if let Some(handle) = recording.handle.take() {
        handle
            .join()
            .map_err(|_| "The microphone thread stopped unexpectedly.".to_string())?;
    }

    let failure = recording
        .error
        .lock()
        .ok()
        .and_then(|mut slot| slot.take());
    let dir = meeting_dir(&state.data_dir, &recording.id);
    if let Some(message) = failure {
        let _ = fs::remove_dir_all(&dir);
        state.meetings.finish_process();
        return Err(message);
    }

    let duration = wav_duration(&recording.audio_path).unwrap_or(0.0);
    if duration < 1.0 {
        let _ = fs::remove_dir_all(&dir);
        state.meetings.finish_process();
        return Err("The recording was too short. Try again and speak for a few seconds.".into());
    }

    let mut record = read_record(&dir)?;
    record.ended_at = Some(Local::now().to_rfc3339());
    record.duration_sec = duration;
    record.status = "recorded".into();
    write_record(&dir, &record)?;

    state.meetings.set_phase("recorded");
    emit(
        &app,
        &recording.id,
        "recorded",
        "recorded",
        Some(35),
        "Recording saved. Ready to transcribe.",
    );
    Ok(MeetingStopped {
        id: recording.id,
        duration_sec: duration,
    })
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

fn timestamp(seconds: f64) -> String {
    let total = seconds.max(0.0) as u64;
    if total >= 3600 {
        format!("{}:{:02}:{:02}", total / 3600, (total % 3600) / 60, total % 60)
    } else {
        format!("{:02}:{:02}", total / 60, total % 60)
    }
}

fn transcribe_chunk(
    context: &whisper_rs::WhisperContext,
    samples: &[f32],
    offset_seconds: f64,
) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy};

    let mut state = context
        .create_state()
        .map_err(|error| format!("Could not prepare Whisper: {error}"))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(None);
    params.set_translate(false);
    params.set_no_timestamps(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_suppress_non_speech_tokens(true);
    params.set_temperature(0.0);
    state
        .full(params, samples)
        .map_err(|error| format!("Whisper could not transcribe this part: {error}"))?;

    let count = state
        .full_n_segments()
        .map_err(|error| format!("Whisper returned no segments: {error}"))?;
    let mut text = String::new();
    for index in 0..count {
        let Ok(segment) = state.full_get_segment_text_lossy(index) else {
            continue;
        };
        let segment = segment.trim();
        if segment.is_empty() {
            continue;
        }
        let start = state.full_get_segment_t0(index).unwrap_or(0) as f64 / 100.0;
        text.push_str(&format!(
            "[{}] {}\n",
            timestamp(offset_seconds + start),
            segment
        ));
    }
    Ok(text)
}

fn transcribe_file(
    audio: &Path,
    model: &Path,
    mut progress: impl FnMut(u8, &str),
) -> Result<String, String> {
    use whisper_rs::{WhisperContext, WhisperContextParameters};

    let mut reader = hound::WavReader::open(audio)
        .map_err(|error| format!("Could not read the recording: {error}"))?;
    let spec = reader.spec();
    if spec.channels != 1 || spec.sample_rate != SAMPLE_RATE || spec.bits_per_sample != 16 {
        return Err("The recording is not in the expected 16 kHz mono format.".into());
    }
    let total = reader.len() as usize;

    progress(40, "Loading Whisper locally");

    let mut context_params = WhisperContextParameters::default();
    context_params.use_gpu = true;
    context_params.flash_attn = true;
    let context = WhisperContext::new_with_params(&model.to_string_lossy(), context_params)
        .map_err(|error| format!("Could not load the transcription model: {error}"))?;

    let mut all = String::new();
    let mut processed = 0usize;
    let mut chunk = Vec::with_capacity(CHUNK_SAMPLES);
    let mut chunk_index = 0usize;

    for sample in reader.samples::<i16>() {
        let sample = sample.map_err(|error| format!("Could not read the recording: {error}"))?;
        chunk.push(sample as f32 / 32_768.0);
        processed += 1;
        if chunk.len() >= CHUNK_SAMPLES {
            let offset = chunk_index as f64 * CHUNK_SECONDS as f64;
            let text = transcribe_chunk(&context, &chunk, offset)?;
            all.push_str(&text);
            chunk.clear();
            chunk_index += 1;
            let percent = 40 + ((processed as f64 / total.max(1) as f64) * 40.0) as u8;
            progress(percent.min(80), &format!("Transcribing part {}", chunk_index));
        }
    }

    if !chunk.is_empty() {
        let offset = chunk_index as f64 * CHUNK_SECONDS as f64;
        let text = transcribe_chunk(&context, &chunk, offset)?;
        all.push_str(&text);
    }

    Ok(all.trim().to_string())
}

fn transcribe_audio(
    app: &AppHandle,
    id: &str,
    audio: &Path,
    model: &Path,
) -> Result<String, String> {
    transcribe_file(audio, model, |percent, message| {
        emit(app, id, "transcribe", "transcribing", Some(percent), message);
    })
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

fn chunks_of(transcript: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for line in transcript.lines() {
        if current.len() + line.len() + 1 > MAX_SUMMARY_CHARS && !current.is_empty() {
            chunks.push(current.trim().to_string());
            current.clear();
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }
    if chunks.is_empty() {
        chunks.push(transcript.trim().to_string());
    }
    chunks
}

fn notes_prompt(transcript: &str) -> String {
    format!(
        "Meeting transcript:\n\n{transcript}\n\nWrite the meeting notes with exactly these sections:\n## Summary\n3 to 6 bullets.\n## Decisions\n- decision (or \"None recorded\")\n## Action items\n- owner — action — due date (or \"no date\")\n## Open questions\n- question (or \"None\")\n\nKeep it factual and short."
    )
}

fn resolve_model(models_dir: &Path, selected: Option<String>) -> Option<String> {
    selected
        .filter(|value| {
            !value.is_empty()
                && value != "extractive"
                && model::path_for(models_dir, value).is_some()
        })
        .or_else(|| model::list(models_dir).first().map(|item| item.id.clone()))
}

fn generate_notes(
    app: &AppHandle,
    id: &str,
    transcript: &str,
    models_dir: &Path,
    model_id: Option<String>,
) -> String {
    if transcript.trim().is_empty() {
        return "No speech was detected in this recording.".to_string();
    }
    let Some(model_id) = model_id else {
        return "The transcript is saved below. No local model file is installed. Download Phi-4 Mini in Settings, or add a .gguf file to the models folder, to generate written notes."
            .to_string();
    };

    let chunks = chunks_of(transcript);
    let result = if chunks.len() <= 1 {
        emit(app, id, "notes", "writing", Some(82), "Writing notes with the local model");
        model::generate(
            models_dir,
            &model_id,
            SUMMARY_SYSTEM,
            &notes_prompt(transcript),
            &[],
        )
    } else {
        let mut summaries = Vec::new();
        for (index, chunk) in chunks.iter().enumerate() {
            let percent = 80 + ((index as f64 / chunks.len() as f64) * 12.0) as u8;
            emit(
                app,
                id,
                "notes",
                "summarising",
                Some(percent.min(92)),
                &format!("Summarising part {} of {}", index + 1, chunks.len()),
            );
            let prompt = format!(
                "This is part {} of {}. Extract decisions, action items and open questions from it.\n\n{chunk}",
                index + 1,
                chunks.len()
            );
            match model::generate(models_dir, &model_id, SUMMARY_SYSTEM, &prompt, &[]) {
                Ok(value) => summaries.push(format!("Part {}\n{}", index + 1, value.trim())),
                Err(error) => {
                    return format!(
                        "The transcript is saved below, but notes could not be generated: {error}"
                    )
                }
            }
        }
        let combined = summaries.join("\n\n");
        emit(app, id, "notes", "writing", Some(94), "Writing the final notes");
        model::generate(
            models_dir,
            &model_id,
            SUMMARY_SYSTEM,
            &format!(
                "These are summaries of consecutive parts of one meeting. Combine them into one set of notes with exactly these sections: ## Summary, ## Decisions, ## Action items, ## Open questions. Remove duplication and keep it factual.\n\n{combined}"
            ),
            &[],
        )
    };

    match result {
        Ok(notes) if !notes.trim().is_empty() => notes,
        Ok(_) => "The model returned no notes. The transcript is saved below.".to_string(),
        Err(error) => format!(
            "The transcript is saved below, but notes could not be generated: {error}"
        ),
    }
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

fn run_process(app: &AppHandle, id: &str) -> Result<MeetingRecord, String> {
    let state = app.state::<AppState>();
    let dir = meeting_dir(&state.data_dir, id);
    let audio = dir.join("audio.wav");
    let mut record = read_record(&dir)?;
    let model = model_path(&state.data_dir);

    let result = (|| -> Result<(), String> {
        if !audio.is_file() {
            return Err("The recording is no longer available.".into());
        }
        if !valid_model(&model) {
            return Err("Install the local transcription model first.".into());
        }

        record.status = "transcribing".into();
        record.error = None;
        write_record(&dir, &record)?;
        state.meetings.set_phase("transcribing");

        let transcript = transcribe_audio(app, id, &audio, &model)?;
        record.transcript = transcript;
        record.status = "summarizing".into();
        write_record(&dir, &record)?;
        state.meetings.set_phase("summarizing");

        let settings = state
            .settings
            .lock()
            .map_err(|_| "Could not read the settings.".to_string())?
            .get();
        let model_id = resolve_model(&state.models_dir, settings.selected_model.clone());
        let notes = generate_notes(
            app,
            id,
            &record.transcript,
            &state.models_dir,
            model_id.clone(),
        );
        record.notes = notes;
        record.model = model_id;

        if let Some(folder) = settings.saved_folder.as_deref() {
            let body = format!(
                "{}\n\n---\n\n## Transcript\n\n{}",
                record.notes.trim(),
                record.transcript.trim()
            );
            match crate::commands::write_saved_answer(
                folder,
                "briefing",
                &record.title,
                &body,
                &["Local microphone recording".to_string()],
            ) {
                Ok(path) => record.saved_path = Some(path),
                Err(error) => {
                    record.error = Some(format!("The note was saved locally, but the Markdown copy failed: {error}"));
                }
            }
        }

        record.ended_at = Some(Local::now().to_rfc3339());
        record.status = "ready".into();
        record.audio_deleted = true;
        write_record(&dir, &record)?;
        let _ = fs::remove_file(&audio);
        Ok(())
    })();

    match result {
        Ok(()) => {
            write_record(&dir, &record)?;
            emit(
                app,
                id,
                "done",
                "ready",
                Some(100),
                "Notes are ready.",
            );
            Ok(record)
        }
        Err(error) => {
            record.status = "error".into();
            record.error = Some(error.clone());
            record.ended_at = Some(Local::now().to_rfc3339());
            let _ = write_record(&dir, &record);
            emit(app, id, "error", "error", None, &error);
            Err(error)
        }
    }
}

fn run_notes_only(app: &AppHandle, id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let dir = meeting_dir(&state.data_dir, id);
    let mut record = read_record(&dir)?;
    if record.transcript.trim().is_empty() {
        return Err("There is no transcript to turn into notes yet.".into());
    }
    let settings = state
        .settings
        .lock()
        .map_err(|_| "Could not read the settings.".to_string())?
        .get();
    let model_id = resolve_model(&state.models_dir, settings.selected_model.clone());

    record.status = "summarizing".into();
    record.error = None;
    write_record(&dir, &record)?;
    state.meetings.set_phase("summarizing");

    let notes = generate_notes(
        app,
        id,
        &record.transcript,
        &state.models_dir,
        model_id.clone(),
    );
    record.notes = notes;
    record.model = model_id;

    if let Some(folder) = settings.saved_folder.as_deref() {
        let body = format!(
            "{}\n\n---\n\n## Transcript\n\n{}",
            record.notes.trim(),
            record.transcript.trim()
        );
        if let Ok(path) = crate::commands::write_saved_answer(
            folder,
            "briefing",
            &record.title,
            &body,
            &["Local microphone recording".to_string()],
        ) {
            if let Some(old) = record.saved_path.take() {
                let _ = fs::remove_file(old);
            }
            record.saved_path = Some(path);
        }
    }

    record.status = "ready".into();
    if record.ended_at.is_none() {
        record.ended_at = Some(Local::now().to_rfc3339());
    }
    write_record(&dir, &record)?;
    emit(app, id, "done", "ready", Some(100), "Notes are ready.");
    Ok(())
}

#[tauri::command]
pub fn meeting_regenerate_notes(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    if !safe_id(&id) {
        return Err("Unknown meeting.".into());
    }
    let record = read_record(&meeting_dir(&state.data_dir, &id))?;
    if record.transcript.trim().is_empty() {
        return Err("There is no transcript to turn into notes yet.".into());
    }
    state.meetings.begin_process(&id)?;
    state.meetings.set_phase("summarizing");

    let app_for_thread = app.clone();
    thread::spawn(move || {
        let result = run_notes_only(&app_for_thread, &id);
        let state = app_for_thread.state::<AppState>();
        state.meetings.finish_process();
        let _ = result;
    });
    Ok(())
}

#[tauri::command]
pub fn meeting_process(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    if !safe_id(&id) {
        return Err("Unknown meeting.".into());
    }
    let dir = meeting_dir(&state.data_dir, &id);
    let record = read_record(&dir)?;
    if record.status == "ready" {
        return Err("This meeting already has notes.".into());
    }
    if record.status == "recording" {
        return Err("Stop the recording first.".into());
    }
    if !dir.join("audio.wav").is_file() {
        return Err("The recording is no longer available.".into());
    }
    state.meetings.begin_process(&id)?;

    let app_for_thread = app.clone();
    thread::spawn(move || {
        let result = run_process(&app_for_thread, &id);
        let state = app_for_thread.state::<AppState>();
        state.meetings.finish_process();
        let _ = result;
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn meeting_status(state: State<'_, AppState>) -> Result<MeetingStatus, String> {
    let runtime = state.meetings.lock()?;
    let model = model_path(&state.data_dir);
    let mic_available = cpal::default_host().default_input_device().is_some();
    Ok(MeetingStatus {
        recording: runtime.recording.is_some(),
        active_id: runtime.recording.as_ref().map(|item| item.id.clone()),
        started_at: runtime.recording.as_ref().map(|item| item.started_at.clone()),
        processing_id: runtime.processing.clone(),
        phase: runtime.phase.clone().unwrap_or_else(|| "idle".into()),
        model_installed: valid_model(&model),
        model_size_mb: MODEL_SIZE_MB,
        model_path: model.to_string_lossy().to_string(),
        mic_available,
        llm_available: !model::list(&state.models_dir).is_empty(),
    })
}

#[tauri::command]
pub async fn meeting_install_model(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use futures_util::StreamExt;

    let target = model_path(&state.data_dir);
    if valid_model(&target) {
        return Ok(target.to_string_lossy().to_string());
    }
    if state.meetings.downloading.swap(true, Ordering::SeqCst) {
        return Err("The transcription model is already downloading.".into());
    }
    let result = async {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create the model folder: {error}"))?;
        }
        let temporary = target.with_extension("part");
        let client = reqwest::Client::builder()
            .user_agent("FrontDesk/0.1 local meeting notes")
            .build()
            .map_err(|error| format!("Could not prepare the download: {error}"))?;
        let response = client
            .get(MODEL_URL)
            .send()
            .await
            .map_err(|error| format!("Could not start the model download: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "The model download failed with status {}.",
                response.status()
            ));
        }
        let total = response.content_length().unwrap_or(0);
        let mut file = tokio::fs::File::create(&temporary)
            .await
            .map_err(|error| format!("Could not write the model: {error}"))?;
        let mut stream = response.bytes_stream();
        let mut downloaded = 0u64;
        let mut last = 0u8;
        emit(
            &app,
            "",
            "model",
            "downloading",
            Some(0),
            "Downloading Whisper base (57 MB)",
        );
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| format!("The model download was interrupted: {error}"))?;
            tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
                .await
                .map_err(|error| format!("Could not write the model: {error}"))?;
            downloaded += chunk.len() as u64;
            if total > 0 {
                let percent = ((downloaded as f64 / total as f64) * 100.0) as u8;
                if percent >= last.saturating_add(2) || percent == 100 {
                    last = percent;
                    emit(
                        &app,
                        "",
                        "model",
                        "downloading",
                        Some(percent),
                        "Downloading Whisper base",
                    );
                }
            }
        }
        tokio::io::AsyncWriteExt::flush(&mut file)
            .await
            .map_err(|error| format!("Could not finish the model: {error}"))?;
        drop(file);
        if !valid_model(&temporary) {
            let _ = fs::remove_file(&temporary);
            return Err("The downloaded model did not look complete. Try again.".into());
        }
        fs::rename(&temporary, &target)
            .map_err(|error| format!("Could not install the model: {error}"))?;
        emit(&app, "", "model", "ready", Some(100), "Whisper base is ready");
        Ok(target.to_string_lossy().to_string())
    }
    .await;
    state.meetings.downloading.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
pub fn meeting_list(state: State<'_, AppState>) -> Result<Vec<MeetingSummary>, String> {
    let root = meetings_root(&state.data_dir);
    let mut items = Vec::new();
    let Ok(entries) = fs::read_dir(&root) else {
        return Ok(items);
    };
    for entry in entries.flatten() {
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        let Some(id) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if !safe_id(&id) {
            continue;
        }
        if let Ok(record) = read_record(&entry.path()) {
            if record.status != "recording" {
                items.push(summary_of(&record));
            }
        }
    }
    items.sort_by(|left, right| right.started_at.cmp(&left.started_at));
    Ok(items)
}

#[tauri::command]
pub fn meeting_get(state: State<'_, AppState>, id: String) -> Result<MeetingRecord, String> {
    if !safe_id(&id) {
        return Err("Unknown meeting.".into());
    }
    read_record(&meeting_dir(&state.data_dir, &id))
}

#[tauri::command]
pub fn meeting_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if !safe_id(&id) {
        return Err("Unknown meeting.".into());
    }
    {
        let runtime = state.meetings.lock()?;
        if runtime
            .recording
            .as_ref()
            .map(|item| item.id == id)
            .unwrap_or(false)
            || runtime.processing.as_deref() == Some(id.as_str())
        {
            return Err("This meeting is still in use.".into());
        }
    }
    let dir = meeting_dir(&state.data_dir, &id);
    if dir.is_dir() {
        fs::remove_dir_all(&dir)
            .map_err(|error| format!("Could not delete the meeting: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn meeting_reveal(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if !safe_id(&id) {
        return Err("Unknown meeting.".into());
    }
    let dir = meeting_dir(&state.data_dir, &id);
    if !dir.is_dir() {
        return Err("That meeting folder is no longer available.".into());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .status()
            .map_err(|error| format!("Could not open the meeting folder: {error}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .status()
            .map_err(|error| format!("Could not open the meeting folder: {error}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .status()
            .map_err(|error| format!("Could not open the meeting folder: {error}"))?;
    }
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resamples_48k_and_44k_to_16k() {
        for input in [48_000u32, 44_100] {
            let mut resampler = MonoResampler::new(input, SAMPLE_RATE);
            let mut output = Vec::new();
            for _ in 0..input {
                resampler.push(0.0, &mut output);
            }
            let expected = SAMPLE_RATE as i64;
            let actual = output.len() as i64;
            assert!(
                (actual - expected).abs() <= 2,
                "expected about {expected} samples from {input} Hz, got {actual}"
            );
        }
    }

    #[test]
    fn accepts_a_whisper_model_when_provided() {
        let Some(model) = std::env::var_os("FRONTDESK_WHISPER_TEST_MODEL") else {
            return;
        };
        assert!(
            valid_model(Path::new(&model)),
            "the whisper model should pass magic and size validation"
        );
    }

    #[test]
    fn transcribes_a_small_file_when_fixtures_are_provided() {
        let Some(wav) = std::env::var_os("FRONTDESK_WHISPER_TEST_WAV") else {
            return;
        };
        let Some(model) = std::env::var_os("FRONTDESK_WHISPER_TEST_MODEL") else {
            return;
        };
        let text = transcribe_file(Path::new(&wav), Path::new(&model), |_, _| {})
            .expect("whisper transcription failed");
        assert!(!text.trim().is_empty(), "expected some transcript text");
        assert!(text.contains(':'), "expected timestamps in the transcript");
    }
}
