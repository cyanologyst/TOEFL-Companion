import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Offline speech-to-text.
 *
 * The audio is decoded, downmixed and resampled here, where the browser already
 * owns a correct resampler, and handed to whisper.cpp in Rust as raw PCM. The
 * old path asked the webview's speech API for a string, which meant uploading
 * every answer to a speech service and getting back no timings, no confidence,
 * and nothing at all when offline.
 */

/** whisper.cpp accepts one rate only. */
const TARGET_SAMPLE_RATE = 16_000;
const DOWNLOAD_PROGRESS_EVENT = "transcription://download-progress";
const TRANSCRIBE_PROGRESS_EVENT = "transcription://progress";

export interface TranscriptionModel {
  id: string;
  label: string;
  note: string;
  bytes: number;
  installed: boolean;
  recommended: boolean;
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface TranscriptPause {
  start: number;
  seconds: number;
}

export interface TranscriptResult {
  text: string;
  words: TranscriptWord[];
  pauses: TranscriptPause[];
  speakingRate: number;
  silenceRatio: number;
  lowConfidence: string[];
  modelId: string;
  elapsedMs: number;
}

export interface DownloadProgress {
  modelId: string;
  received: number;
  total: number;
}

export interface TranscribeProgress {
  modelId: string;
  /** `loading` is the model coming off disk; `running` is the audio decoding. */
  stage: "loading" | "running";
  /** 0 to 1 within the stage. */
  fraction: number;
}

export const TRANSCRIPTION_DEFAULT_MODEL = "small.en";
const MODEL_PREFERENCE_KEY = "toefl-companion:transcription-model";

export function isTranscriptionSupported(): boolean {
  return isTauri();
}

export function getPreferredModelId(): string {
  try {
    return window.localStorage.getItem(MODEL_PREFERENCE_KEY) ?? TRANSCRIPTION_DEFAULT_MODEL;
  } catch {
    return TRANSCRIPTION_DEFAULT_MODEL;
  }
}

export function setPreferredModelId(modelId: string): void {
  try {
    window.localStorage.setItem(MODEL_PREFERENCE_KEY, modelId);
  } catch {
    // A locked-down profile only costs the preference, not the feature.
  }
}

export function formatModelSize(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export async function listTranscriptionModels(): Promise<TranscriptionModel[]> {
  if (!isTauri()) {
    return [];
  }
  return invoke<TranscriptionModel[]>("transcription_models");
}

export async function downloadTranscriptionModel(
  modelId: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  if (!isTauri()) {
    throw new Error("Speech models can only be installed in the desktop app.");
  }

  const unlisten = onProgress
    ? await listen<DownloadProgress>(DOWNLOAD_PROGRESS_EVENT, (event) => {
        if (event.payload.modelId === modelId) {
          onProgress(event.payload);
        }
      })
    : null;

  try {
    await invoke("download_transcription_model", { modelId });
  } finally {
    unlisten?.();
  }
}

export async function deleteTranscriptionModel(modelId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await invoke("delete_transcription_model", { modelId });
}

/**
 * Decodes any container the recorder produced, downmixes to mono and resamples
 * to 16 kHz. `OfflineAudioContext` is doing the real work: it is the same
 * resampler the browser uses for playback, so this avoids shipping a worse one.
 */
export async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer();

  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(bytes);
  } finally {
    void decoder.close().catch(() => {
      // Closing is best effort; the decode already succeeded or threw.
    });
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Base64 in fixed chunks. `String.fromCharCode(...bytes)` on a 45-second clip
 * is roughly three million arguments and overflows the call stack.
 */
function encodeBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  const CHUNK = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/**
 * Which model a caller wants.
 *
 * `accurate` honours the learner's choice in Settings, which is what an
 * interview answer deserves: it is scored on what they actually said.
 * `fast` is for Listen & Repeat, where the answer is checked by edit distance
 * against a sentence we already have. There, a tight loop beats a better model
 * — measured on this machine, a ten-second clip costs 20.0s on Small, 5.5s on
 * Base and 2.4s on Tiny, because whisper always decodes a full 30-second window
 * however short the recording is.
 */
export type TranscriptionSpeed = "accurate" | "fast";

/** Fastest first, then whatever else is on disk. */
const FAST_PREFERENCE = ["base.en", "tiny.en", "small.en", "medium.en"];

export async function resolveModelId(speed: TranscriptionSpeed): Promise<string> {
  const preferred = getPreferredModelId();
  if (speed === "accurate" || !isTauri()) {
    return preferred;
  }
  try {
    const installed = new Set(
      (await listTranscriptionModels()).filter((model) => model.installed).map((model) => model.id),
    );
    // Never download on the learner's behalf: if the quick models are not
    // there, use the one they already chose.
    return FAST_PREFERENCE.find((id) => installed.has(id)) ?? preferred;
  } catch {
    return preferred;
  }
}

export interface TranscribeOptions {
  speed?: TranscriptionSpeed;
  onProgress?: (progress: TranscribeProgress) => void;
}

export async function transcribeRecording(
  blob: Blob,
  options: TranscribeOptions = {},
): Promise<TranscriptResult> {
  if (!isTauri()) {
    throw new Error("Transcription only runs in the desktop app.");
  }

  const modelId = await resolveModelId(options.speed ?? "accurate");
  const samples = await decodeToMono16k(blob);

  const unlisten = options.onProgress
    ? await listen<TranscribeProgress>(TRANSCRIBE_PROGRESS_EVENT, (event) => {
        if (event.payload.modelId === modelId) {
          options.onProgress?.(event.payload);
        }
      })
    : null;

  try {
    return await invoke<TranscriptResult>("transcribe_speech", {
      request: { modelId, pcmBase64: encodeBase64(samples) },
    });
  } finally {
    unlisten?.();
  }
}
