//! Offline speech-to-text for speaking practice.
//!
//! Transcription runs entirely on this device through whisper.cpp. Nothing is
//! uploaded: the browser speech API this replaces was a network service, which
//! sat badly in a local-first study app and gave back nothing but a string.
//!
//! What the extra work buys is the part a TOEFL learner actually needs. Whisper
//! reports a timestamp and a probability for every token, so alongside the
//! transcript we can return where the speaker paused, how fast they spoke, and
//! which words the model was least sure of. Those low-confidence words are the
//! closest free signal we have to "the examiner did not understand you".
//!
//! One caveat is deliberately fought here. Whisper is trained to produce clean,
//! readable prose, so left alone it silently repairs a learner's grammar and
//! deletes their filler words - flattering, and useless for practice. The
//! decoding parameters below bias it back toward verbatim.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// whisper.cpp only accepts 16 kHz mono. The webview resamples before sending.
pub const SAMPLE_RATE: u32 = 16_000;

/// A gap at least this long reads as a pause worth reporting rather than the
/// ordinary space between words.
const PAUSE_THRESHOLD_SECONDS: f32 = 0.6;

/// Whisper's own probability for a token. Below this the word is worth showing
/// to the learner as "this may not have come across".
const LOW_CONFIDENCE: f32 = 0.55;

/// Nudges the decoder toward writing what was said instead of what was meant.
/// Whisper conditions on this text as though it were the preceding transcript,
/// so a disfluent prompt makes it far likelier to keep the speaker's own
/// hesitations rather than tidying them away.
const VERBATIM_PROMPT: &str =
    "Um, so, I think, uh, the thing is, you know, like, basically, I mean, well, yeah.";

const DOWNLOAD_PROGRESS_EVENT: &str = "transcription://download-progress";
const TRANSCRIBE_PROGRESS_EVENT: &str = "transcription://progress";

struct ModelSpec {
    id: &'static str,
    file: &'static str,
    label: &'static str,
    note: &'static str,
    bytes: u64,
}

/// Quantized English-only builds. The quantization costs very little accuracy
/// and roughly halves both the download and the memory footprint.
const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny.en",
        file: "ggml-tiny.en-q5_1.bin",
        label: "Tiny",
        note: "Fastest, and the weakest on accented speech. Use it only on an old machine.",
        bytes: 32_166_155,
    },
    ModelSpec {
        id: "base.en",
        file: "ggml-base.en-q5_1.bin",
        label: "Base",
        note: "Quick, and roughly level with the old online transcription.",
        bytes: 59_721_011,
    },
    ModelSpec {
        id: "small.en",
        file: "ggml-small.en-q5_1.bin",
        label: "Small",
        note: "Recommended. The best accented-English accuracy that still runs on any CPU.",
        bytes: 190_098_681,
    },
    ModelSpec {
        id: "medium.en",
        file: "ggml-medium.en-q5_0.bin",
        label: "Medium",
        note: "Most accurate. Needs a fast processor and takes noticeably longer.",
        bytes: 539_225_533,
    },
];

pub const DEFAULT_MODEL_ID: &str = "small.en";

fn spec_for(model_id: &str) -> Result<&'static ModelSpec, String> {
    MODELS
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| format!("Unknown transcription model \"{model_id}\"."))
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("No writable application data directory. {error}"))?
        .join("speech-models");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create the model folder. {error}"))?;
    Ok(dir)
}

fn model_path(app: &AppHandle, spec: &ModelSpec) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(spec.file))
}

/// A model counts as installed only at its exact published size. A partial or
/// truncated file would otherwise fail much later, inside whisper.cpp, with a
/// message no one can act on.
fn installed_bytes(path: &Path, expected: u64) -> Option<u64> {
    let size = std::fs::metadata(path).ok()?.len();
    if size == expected { Some(size) } else { None }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    id: String,
    label: String,
    note: String,
    bytes: u64,
    installed: bool,
    recommended: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    model_id: String,
    received: u64,
    total: u64,
}

/// Which part of the work is running. Loading a model and decoding audio have
/// very different durations, and a single bar that covers both silently stalls
/// at 0% for whichever comes first.
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum TranscribeStage {
    Loading,
    Running,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TranscribeProgress {
    model_id: String,
    stage: TranscribeStage,
    /// 0.0 to 1.0 within the stage.
    fraction: f32,
}

/// A dropped listener is not worth failing a transcription over.
fn emit_progress(app: &AppHandle, model_id: &str, stage: TranscribeStage, fraction: f32) {
    let _ = app.emit(
        TRANSCRIBE_PROGRESS_EVENT,
        TranscribeProgress {
            model_id: model_id.to_string(),
            stage,
            fraction,
        },
    );
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptWord {
    text: String,
    start: f32,
    end: f32,
    confidence: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPause {
    start: f32,
    seconds: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptResult {
    text: String,
    words: Vec<TranscriptWord>,
    pauses: Vec<TranscriptPause>,
    /// Words per minute measured over speech only, with pauses removed.
    speaking_rate: f32,
    /// Share of the response spent silent, 0 to 1.
    silence_ratio: f32,
    low_confidence: Vec<String>,
    model_id: String,
    elapsed_ms: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeRequest {
    model_id: String,
    /// 16 kHz mono f32 PCM, little-endian, base64 encoded.
    pcm_base64: String,
}

/// Loading a model costs about a second, so the last one stays resident. A
/// learner records many answers in a row against the same model.
///
/// Shared through an `Arc` because the work runs on a blocking thread, which
/// cannot borrow from the command's scope.
#[derive(Default, Clone)]
pub struct TranscriptionState {
    loaded: Arc<Mutex<Option<(String, WhisperContext)>>>,
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    const INVALID: u8 = 0xFF;
    let mut table = [INVALID; 256];
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (index, byte) in alphabet.iter().enumerate() {
        table[*byte as usize] = index as u8;
    }

    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut buffer: u32 = 0;
    let mut bits = 0u32;
    for byte in input.bytes() {
        if byte == b'=' || byte.is_ascii_whitespace() {
            continue;
        }
        let value = table[byte as usize];
        if value == INVALID {
            return Err("The audio payload is not valid base64.".into());
        }
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Ok(out)
}

fn samples_from_bytes(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if bytes.len() % 4 != 0 {
        return Err("The audio payload is not a whole number of 32-bit samples.".into());
    }
    Ok(bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

#[tauri::command]
pub async fn transcription_models(app: AppHandle) -> Result<Vec<ModelStatus>, String> {
    let dir = models_dir(&app)?;
    Ok(MODELS
        .iter()
        .map(|spec| ModelStatus {
            id: spec.id.to_string(),
            label: spec.label.to_string(),
            note: spec.note.to_string(),
            bytes: spec.bytes,
            installed: installed_bytes(&dir.join(spec.file), spec.bytes).is_some(),
            recommended: spec.id == DEFAULT_MODEL_ID,
        })
        .collect())
}

#[tauri::command]
pub async fn download_transcription_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let spec = spec_for(&model_id)?;
    let target = model_path(&app, spec)?;
    if installed_bytes(&target, spec.bytes).is_some() {
        return Ok(());
    }

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        spec.file
    );

    // Download beside the target and rename on success, so an interrupted
    // download can never be mistaken for an installed model.
    let partial = target.with_extension("part");
    // Resuming matters more than it looks: this is a 190 MB file, and the
    // learners this app is for are the likeliest to be on a connection that
    // drops halfway through.
    let already_have = tokio::fs::metadata(&partial)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0)
        .min(spec.bytes);

    let mut request = reqwest::Client::new().get(&url);
    if already_have > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={already_have}-"));
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("The model could not be downloaded. {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "The model download failed with status {}.",
            response.status()
        ));
    }

    // A server that ignores the range header sends the whole file back with
    // 200, so the partial file has to be thrown away rather than appended to.
    let resuming = already_have > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let mut received: u64 = if resuming { already_have } else { 0 };
    let total = response.content_length().unwrap_or(spec.bytes - received) + received;

    let mut file = if resuming {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(&partial)
            .await
    } else {
        tokio::fs::File::create(&partial).await
    }
    .map_err(|error| format!("Could not write to the model folder. {error}"))?;

    let mut last_emitted: u64 = received;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            format!("The model download was interrupted. {error}")
        })?;
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("Could not save the model. {error}"))?;
        received += chunk.len() as u64;

        // One event per megabyte; per-chunk would flood the webview.
        if received - last_emitted >= 1_048_576 || received == total {
            last_emitted = received;
            let _ = app.emit(
                DOWNLOAD_PROGRESS_EVENT,
                DownloadProgress {
                    model_id: model_id.clone(),
                    received,
                    total,
                },
            );
        }
    }

    file.flush()
        .await
        .map_err(|error| format!("Could not finish saving the model. {error}"))?;
    drop(file);

    if received < spec.bytes {
        // Short but consistent: the connection dropped. Keep what arrived so
        // the next attempt resumes instead of starting the 190 MB again.
        let percent = (received as f64 / spec.bytes as f64 * 100.0).round();
        return Err(format!(
            "The download stopped at {percent}%. Press Install again to carry on from there."
        ));
    }
    if received > spec.bytes {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!(
            "The downloaded model is {received} bytes but should be {}. It was discarded; try again.",
            spec.bytes
        ));
    }

    tokio::fs::rename(&partial, &target)
        .await
        .map_err(|error| format!("Could not finalise the model file. {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_transcription_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let spec = spec_for(&model_id)?;
    let target = model_path(&app, spec)?;
    if target.exists() {
        tokio::fs::remove_file(&target)
            .await
            .map_err(|error| format!("Could not remove the model. {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn transcribe_speech(
    app: AppHandle,
    state: State<'_, TranscriptionState>,
    request: TranscribeRequest,
) -> Result<TranscriptResult, String> {
    let spec = spec_for(&request.model_id)?;
    let path = model_path(&app, spec)?;
    if installed_bytes(&path, spec.bytes).is_none() {
        return Err(format!(
            "The {} speech model is not installed yet.",
            spec.label
        ));
    }

    let samples = samples_from_bytes(&decode_base64(&request.pcm_base64)?)?;
    if samples.len() < SAMPLE_RATE as usize / 4 {
        return Err("The recording is too short to transcribe.".into());
    }

    let model_id = request.model_id.clone();
    let path_string = path.to_string_lossy().to_string();
    let engine = state.inner().clone();
    let reporter = app.clone();

    // whisper.cpp saturates every core it is given; keeping it off the async
    // runtime keeps the window responsive while it works.
    tauri::async_runtime::spawn_blocking(move || {
        run_transcription(&engine, &reporter, &model_id, &path_string, &samples)
    })
    .await
    .map_err(|error| format!("The transcription task could not run. {error}"))?
}

fn run_transcription(
    state: &TranscriptionState,
    app: &AppHandle,
    model_id: &str,
    model_path: &str,
    samples: &[f32],
) -> Result<TranscriptResult, String> {
    let started = Instant::now();
    // Loading is its own visible stage: the first run of a session pays for it,
    // and on the 539 MB model that is several seconds before any audio is read.
    emit_progress(app, model_id, TranscribeStage::Loading, 0.0);

    let mut loaded = state
        .loaded
        .lock()
        .map_err(|_| "The transcription engine is in a bad state. Restart the app.".to_string())?;

    let needs_load = !matches!(loaded.as_ref(), Some((id, _)) if id == model_id);
    if needs_load {
        // Drop the previous model before allocating the next one; holding both
        // briefly doubles the memory for no reason.
        *loaded = None;
        let context =
            WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
                .map_err(|error| format!("The speech model could not be loaded. {error}"))?;
        *loaded = Some((model_id.to_string(), context));
    }

    let (_, context) = loaded
        .as_ref()
        .ok_or_else(|| "The speech model could not be loaded.".to_string())?;
    let mut whisper = context
        .create_state()
        .map_err(|error| format!("The transcription engine could not start. {error}"))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    // Whisper's own threading scales poorly past four; more cores mostly add
    // contention on a short clip.
    params.set_n_threads(num_cpus::get().clamp(1, 8) as i32);
    params.set_language(Some("en"));
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    // Per-token timing and probability are the whole reason for running a real
    // model rather than taking a plain string from the browser.
    params.set_token_timestamps(true);
    params.set_split_on_word(true);
    // A single response is self-contained. Carrying context across a 45 second
    // clip is the main cause of Whisper looping the same phrase on silence.
    params.set_no_context(true);
    params.set_temperature(0.0);
    params.set_initial_prompt(VERBATIM_PROMPT);

    // Without this the window sat on "Transcribing your response on this device."
    // for twenty seconds with nothing moving, which reads as a hung app rather
    // than a working one. whisper reports its own percentage; pass it straight
    // through rather than animating a guess.
    let progress_app = app.clone();
    let progress_model = model_id.to_string();
    params.set_progress_callback_safe(move |percent: i32| {
        emit_progress(
            &progress_app,
            &progress_model,
            TranscribeStage::Running,
            (percent as f32 / 100.0).clamp(0.0, 1.0),
        );
    });

    whisper
        .full(params, samples)
        .map_err(|error| format!("The response could not be transcribed. {error}"))?;

    emit_progress(app, model_id, TranscribeStage::Running, 1.0);

    let mut text = String::new();
    let mut words: Vec<TranscriptWord> = Vec::new();

    for index in 0..whisper.full_n_segments() {
        let Some(segment) = whisper.get_segment(index) else {
            continue;
        };
        if let Ok(segment_text) = segment.to_str_lossy() {
            text.push_str(&segment_text);
        }

        for token_index in 0..segment.n_tokens() {
            let Some(token) = segment.get_token(token_index) else {
                continue;
            };
            let Ok(piece) = token.to_str_lossy() else {
                continue;
            };
            // Special markers such as [_BEG_] carry no audio.
            if piece.starts_with("[_") || piece.trim().is_empty() {
                continue;
            }

            let data = token.token_data();
            let start = data.t0 as f32 / 100.0;
            let end = data.t1 as f32 / 100.0;
            let confidence = token.token_probability();

            // Whisper emits sub-word pieces; a piece that does not open with a
            // space continues the previous word rather than starting a new one.
            if !piece.starts_with(' ') && !words.is_empty() {
                let last = words.last_mut().expect("checked non-empty");
                last.text.push_str(piece.trim_start());
                last.end = end.max(last.end);
                last.confidence = last.confidence.min(confidence);
            } else {
                words.push(TranscriptWord {
                    text: piece.trim().to_string(),
                    start,
                    end,
                    confidence,
                });
            }
        }
    }

    words.retain(|word| !word.text.is_empty());

    let mut pauses = Vec::new();
    for pair in words.windows(2) {
        let gap = pair[1].start - pair[0].end;
        if gap >= PAUSE_THRESHOLD_SECONDS {
            pauses.push(TranscriptPause {
                start: pair[0].end,
                seconds: gap,
            });
        }
    }

    let total_seconds = samples.len() as f32 / SAMPLE_RATE as f32;
    let paused_seconds: f32 = pauses.iter().map(|pause| pause.seconds).sum();
    let leading_silence = words.first().map(|word| word.start).unwrap_or(total_seconds);
    let trailing_silence = words
        .last()
        .map(|word| (total_seconds - word.end).max(0.0))
        .unwrap_or(0.0);
    let silent_seconds = paused_seconds + leading_silence + trailing_silence;
    let speaking_seconds = (total_seconds - silent_seconds).max(0.1);

    let speaking_rate = words.len() as f32 / speaking_seconds * 60.0;
    let silence_ratio = if total_seconds > 0.0 {
        (silent_seconds / total_seconds).clamp(0.0, 1.0)
    } else {
        0.0
    };

    // One entry per distinct word: the same word mumbled twice is one problem,
    // not two.
    let mut seen: HashMap<String, ()> = HashMap::new();
    let mut low_confidence = Vec::new();
    for word in &words {
        if word.confidence >= LOW_CONFIDENCE {
            continue;
        }
        let key = word
            .text
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
        if key.is_empty() || seen.insert(key.clone(), ()).is_some() {
            continue;
        }
        low_confidence.push(word.text.trim().to_string());
    }

    Ok(TranscriptResult {
        text: text.trim().to_string(),
        words,
        pauses,
        speaking_rate,
        silence_ratio,
        low_confidence,
        model_id: model_id.to_string(),
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}
