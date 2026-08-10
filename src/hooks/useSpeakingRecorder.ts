import { useCallback, useEffect, useRef, useState } from "react";
import { recordingRepository, RecordingStorageError } from "../services/recordingRepository";
import {
  isTranscriptionSupported,
  transcribeRecording,
  type TranscriptResult,
} from "../services/transcription";
import { formatCount } from "../lib/format";
import type { RecorderPhase, RecordingCompletion, SavedRecordingMetadata } from "../types/toefl";

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const DEFAULT_PREPARATION_SECONDS = 3;

export type RecorderFailureKind =
  | "unsupported"
  | "permission"
  | "device"
  | "recording"
  | "storage"
  | "history"
  | "discard";

/** `live` is the webview's own speech API, used only where whisper.cpp is not. */
export type TranscriptionPhase = "idle" | "live" | "running" | "done" | "failed";

interface UseSpeakingRecorderOptions {
  maxSeconds?: number;
  preparationSeconds?: number;
  onSave: (result: SavedRecordingMetadata) => void;
}

export interface SpeakingRecorderController {
  phase: RecorderPhase;
  failureKind: RecorderFailureKind | null;
  countdown: number;
  secondsLeft: number;
  transcript: string;
  transcriptionPhase: TranscriptionPhase;
  transcriptionError: string;
  analysis: TranscriptResult | null;
  result: RecordingCompletion | null;
  error: string;
  statusMessage: string;
  pendingAction: "save" | "discard" | null;
  analyserRef: React.RefObject<AnalyserNode | null>;
  isSupported: boolean;
  isStopping: boolean;
  start: () => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  save: () => Promise<void>;
  discard: () => Promise<boolean>;
  recordAgain: () => Promise<void>;
  reset: () => void;
}

function getMimeType(): string {
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function microphoneError(error: unknown): { kind: RecorderFailureKind; message: string } {
  if (error instanceof DOMException) {
    if (
      error.name === "NotAllowedError" ||
      error.name === "SecurityError" ||
      error.name === "PermissionDeniedError"
    ) {
      return {
        kind: "permission",
        message:
          "Microphone access is off for TOEFL Companion. Turn it on in Windows Settings under Privacy & security > Microphone, then try again.",
      };
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return {
        kind: "device",
        message: "No microphone was found. Connect or enable a microphone, then try again.",
      };
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return {
        kind: "device",
        message:
          "The microphone is unavailable or being used by another app. Close the other app and try again.",
      };
    }
    if (error.name === "AbortError") {
      return {
        kind: "device",
        message: "Microphone access was interrupted. Check the device connection and try again.",
      };
    }
  }

  return {
    kind: "device",
    message:
      "TOEFL Companion could not start the microphone. Check the device connection and Windows microphone access, then try again.",
  };
}

function storageErrorMessage(error: unknown): string {
  if (error instanceof RecordingStorageError) {
    return error.message;
  }
  return "The response could not be saved on this device. Your draft is still available; try again.";
}

export function useSpeakingRecorder({
  maxSeconds = 45,
  preparationSeconds = DEFAULT_PREPARATION_SECONDS,
  onSave,
}: UseSpeakingRecorderOptions): SpeakingRecorderController {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [failureKind, setFailureKind] = useState<RecorderFailureKind | null>(null);
  const [countdown, setCountdown] = useState(preparationSeconds);
  const [secondsLeft, setSecondsLeft] = useState(maxSeconds);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<RecordingCompletion | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    `Ready to record a ${maxSeconds}-second response.`,
  );
  const [pendingAction, setPendingAction] = useState<"save" | "discard" | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [transcriptionPhase, setTranscriptionPhase] = useState<TranscriptionPhase>("idle");
  const [transcriptionError, setTranscriptionError] = useState("");
  const [analysis, setAnalysis] = useState<TranscriptResult | null>(null);

  /* On the desktop the response is transcribed here, by whisper.cpp, after the
     take finishes. The webview's own speech API is a network service, so it is
     used only in the browser build where there is no local engine. */
  const localTranscription = isTranscriptionSupported();

  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef("");
  const resultRef = useRef<RecordingCompletion | null>(null);
  const startedAtRef = useRef(0);
  const countdownTimerRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const persistedMetadataRef = useRef<SavedRecordingMetadata | null>(null);
  const finalizedRef = useRef(false);
  const generationRef = useRef(0);
  const discardOnStopRef = useRef(false);
  const stoppingRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const onSaveRef = useRef(onSave);

  onSaveRef.current = onSave;

  const isSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  const clearTimers = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback((abort = false) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) {
      return;
    }

    try {
      if (abort) {
        recognition.abort();
      } else {
        recognition.stop();
      }
    } catch {
      try {
        recognition.abort();
      } catch {
        // The recognition service has already ended.
      }
    }
  }, []);

  const releaseCapture = useCallback(() => {
    clearTimers();
    stopRecognition(true);
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    analyserRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => {
        // Capture has already ended; a close failure needs no user action.
      });
    }
  }, [clearTimers, stopRecognition]);

  const abandonActiveCapture = useCallback(() => {
    generationRef.current += 1;
    clearTimers();
    stopRecognition(true);

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      discardOnStopRef.current = true;
      try {
        recorder.stop();
      } catch {
        // The stream is released below even if MediaRecorder already stopped.
      }
    }

    stoppingRef.current = false;
    chunksRef.current = [];
    releaseCapture();
  }, [clearTimers, releaseCapture, stopRecognition]);

  const clearDraft = useCallback((deleteUnfinalizedRecording: boolean) => {
    const draftId = draftIdRef.current;
    const persisted = persistedMetadataRef.current;
    const finalized = finalizedRef.current;

    if (draftId) {
      recordingRepository.discardDraft(draftId);
    }
    if (deleteUnfinalizedRecording && persisted && !finalized) {
      void recordingRepository.deleteRecording(persisted.id).catch(() => {
        // A question change or window close leaves no safe place to surface
        // this cleanup failure. The record remains recoverable in IndexedDB.
      });
    }

    draftIdRef.current = null;
    persistedMetadataRef.current = null;
    finalizedRef.current = false;
    resultRef.current = null;
  }, []);

  const setIdleState = useCallback(() => {
    setPhase("idle");
    setFailureKind(null);
    setCountdown(preparationSeconds);
    setSecondsLeft(maxSeconds);
    setTranscript("");
    transcriptRef.current = "";
    setResult(null);
    resultRef.current = null;
    setError("");
    setPendingAction(null);
    setIsStopping(false);
    setTranscriptionPhase("idle");
    setTranscriptionError("");
    setAnalysis(null);
    setStatusMessage(`Ready to record a ${maxSeconds}-second response.`);
  }, [maxSeconds, preparationSeconds]);

  const reset = useCallback(() => {
    abandonActiveCapture();
    clearDraft(true);
    saveInFlightRef.current = false;
    setIdleState();
  }, [abandonActiveCapture, clearDraft, setIdleState]);

  const failCapture = useCallback(
    (kind: RecorderFailureKind, message: string, status: string) => {
      abandonActiveCapture();
      if (!mountedRef.current) {
        return;
      }
      setFailureKind(kind);
      setError(message);
      setPhase("failed");
      setIsStopping(false);
      setStatusMessage(status);
    },
    [abandonActiveCapture],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive" || stoppingRef.current) {
      return;
    }

    stoppingRef.current = true;
    setIsStopping(true);
    setStatusMessage("Finishing your response.");
    clearTimers();
    stopRecognition();

    try {
      recorder.stop();
    } catch {
      failCapture(
        "recording",
        "The recorder could not finish the response. Please record it again.",
        "Recording failed while stopping.",
      );
    }
  }, [clearTimers, failCapture, stopRecognition]);

  /* Runs after the take is already playable, so the learner is never kept
     waiting on the model to see that their recording worked. */
  const runTranscription = useCallback(
    async (blob: Blob, completion: RecordingCompletion, generation: number) => {
      setTranscriptionPhase("running");
      setTranscriptionError("");
      setAnalysis(null);
      setStatusMessage("Transcribing your response on this device.");

      try {
        const transcription = await transcribeRecording(blob);
        if (generation !== generationRef.current || !mountedRef.current) {
          return;
        }

        transcriptRef.current = transcription.text;
        setTranscript(transcription.text);
        setAnalysis(transcription);
        setTranscriptionPhase("done");

        // save() reads the transcript off the staged draft, so the draft has to
        // be replaced with the text the local model produced.
        const updated: RecordingCompletion = {
          ...completion,
          transcript: transcription.text,
        };
        resultRef.current = updated;
        setResult(updated);
        try {
          recordingRepository.stageDraft({ ...updated, blob });
        } catch {
          // The take is still playable and savable; only the improved
          // transcript would be lost, and it is already on screen.
        }
        setStatusMessage(
          `Transcribed in ${(transcription.elapsedMs / 1_000).toFixed(
            1,
          )} seconds. Save or discard this response.`,
        );
      } catch (transcriptionError_) {
        if (generation !== generationRef.current || !mountedRef.current) {
          return;
        }
        setTranscriptionPhase("failed");
        setTranscriptionError(
          transcriptionError_ instanceof Error
            ? transcriptionError_.message
            : "The response could not be transcribed.",
        );
        setStatusMessage("The response was recorded, but it could not be transcribed.");
      }
    },
    [],
  );

  const beginRecording = useCallback(
    (stream: MediaStream, generation: number) => {
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }

      chunksRef.current = [];
      discardOnStopRef.current = false;
      stoppingRef.current = false;
      setIsStopping(false);

      const mimeType = getMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        failCapture(
          "recording",
          "The recorder could not start. Restart TOEFL Companion and try again.",
          "Recording failed to start.",
        );
        return;
      }
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (generation === generationRef.current && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (generation !== generationRef.current) {
          return;
        }
        discardOnStopRef.current = true;
        failCapture(
          "recording",
          "Recording was interrupted. Your unfinished take was discarded; please try again.",
          "Recording was interrupted.",
        );
      };

      recorder.onstop = () => {
        recorderRef.current = null;

        if (generation !== generationRef.current || discardOnStopRef.current) {
          discardOnStopRef.current = false;
          chunksRef.current = [];
          releaseCapture();
          return;
        }

        const durationSeconds = Math.max(
          1,
          Math.min(maxSeconds, Math.round((performance.now() - startedAtRef.current) / 1_000)),
        );
        const resolvedMimeType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, {
          type: resolvedMimeType,
        });

        stoppingRef.current = false;
        setIsStopping(false);
        chunksRef.current = [];
        releaseCapture();

        if (blob.size === 0) {
          setFailureKind("recording");
          setError(
            "No audio was captured. Check the microphone connection and input level, then try again.",
          );
          setPhase("failed");
          setStatusMessage("No audio was captured.");
          return;
        }

        const id = crypto.randomUUID();
        const url = URL.createObjectURL(blob);
        const completion: RecordingCompletion = {
          id,
          url,
          transcript: transcriptRef.current.trim(),
          durationSeconds,
          size: blob.size,
          mimeType: resolvedMimeType,
          createdAt: new Date().toISOString(),
        };

        try {
          recordingRepository.stageDraft({
            ...completion,
            blob,
          });
        } catch (stageError) {
          URL.revokeObjectURL(url);
          setFailureKind("recording");
          setError(
            stageError instanceof Error
              ? stageError.message
              : "The recorded audio could not be prepared for playback.",
          );
          setPhase("failed");
          setStatusMessage("The recording draft could not be prepared.");
          return;
        }

        draftIdRef.current = id;
        persistedMetadataRef.current = null;
        finalizedRef.current = false;
        resultRef.current = completion;
        setResult(completion);
        setFailureKind(null);
        setError("");
        setPhase("completed");
        setStatusMessage(
          `Draft ready. ${formatCount(
            durationSeconds,
            "second",
          )} recorded. Save or discard this response.`,
        );

        if (localTranscription) {
          void runTranscription(blob, completion, generation);
        }
        // History is intentionally not updated here. Only save() emits onSave.
      };

      /* Only in the browser build. In the desktop app this API would ship the
         learner's audio to a speech service, which whisper.cpp makes needless. */
      const Recognition = localTranscription
        ? undefined
        : (window.SpeechRecognition ?? window.webkitSpeechRecognition);
      if (Recognition) {
        const recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
          if (generation !== generationRef.current) {
            return;
          }
          let nextTranscript = "";
          for (let index = 0; index < event.results.length; index += 1) {
            nextTranscript += `${event.results[index][0].transcript} `;
          }
          transcriptRef.current = nextTranscript.trim();
          setTranscript(transcriptRef.current);
        };
        recognition.onerror = (event) => {
          if (
            generation === generationRef.current &&
            event.error !== "no-speech" &&
            event.error !== "aborted"
          ) {
            setStatusMessage("Recording continues, but live transcription is unavailable.");
          }
        };
        recognitionRef.current = recognition;
        try {
          recognition.start();
          setTranscriptionPhase("live");
        } catch {
          recognitionRef.current = null;
        }
      }

      startedAtRef.current = performance.now();
      setSecondsLeft(maxSeconds);
      setPhase("recording");
      setStatusMessage("Recording in progress. Press Space on Stop to finish.");

      try {
        recorder.start(250);
      } catch {
        recorderRef.current = null;
        discardOnStopRef.current = true;
        failCapture(
          "recording",
          "The recorder could not start. Restart TOEFL Companion and try again.",
          "Recording failed to start.",
        );
        return;
      }

      let previousSeconds = maxSeconds;
      recordingTimerRef.current = window.setInterval(() => {
        if (generation !== generationRef.current) {
          clearTimers();
          return;
        }

        const elapsed = (performance.now() - startedAtRef.current) / 1_000;
        const remaining = Math.max(0, Math.ceil(maxSeconds - elapsed));
        if (remaining !== previousSeconds) {
          previousSeconds = remaining;
          setSecondsLeft(remaining);
        }
        if (remaining <= 0 && !stoppingRef.current) {
          stop();
        }
      }, 200);
    },
    [
      clearTimers,
      failCapture,
      localTranscription,
      maxSeconds,
      releaseCapture,
      runTranscription,
      stop,
    ],
  );

  const requestCapture = useCallback(
    async (retrying: boolean) => {
      if (!isSupported) {
        setFailureKind("unsupported");
        setError(
          "Microphone recording is not available in this installation. Restart TOEFL Companion or install the latest version.",
        );
        setPhase("failed");
        setStatusMessage("Microphone recording is unavailable.");
        return;
      }

      abandonActiveCapture();
      clearDraft(true);
      saveInFlightRef.current = false;
      setCountdown(preparationSeconds);
      setSecondsLeft(maxSeconds);
      setTranscript("");
      transcriptRef.current = "";
      setResult(null);
      resultRef.current = null;
      setError("");
      setFailureKind(null);
      setPendingAction(null);
      setIsStopping(false);

      const generation = generationRef.current;
      setPhase(retrying ? "retrying" : "requesting");
      setStatusMessage(
        retrying ? "Trying microphone access again." : "Requesting microphone access.",
      );

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        if (generation !== generationRef.current || !mountedRef.current) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }

        streamRef.current = stream;

        try {
          const audioContext = new AudioContext();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.76;
          source.connect(analyser);
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
          if (audioContext.state === "suspended") {
            void audioContext.resume().catch(() => {
              if (generation === generationRef.current && analyserRef.current === analyser) {
                analyserRef.current = null;
              }
            });
          }
        } catch {
          // Audio recording can continue without the decorative waveform.
          analyserRef.current = null;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.onended = () => {
            if (generation === generationRef.current && !stoppingRef.current) {
              failCapture(
                "device",
                "The microphone disconnected during the response. Reconnect it and try again.",
                "The microphone disconnected.",
              );
            }
          };
        }

        if (preparationSeconds <= 0) {
          setCountdown(0);
          beginRecording(stream, generation);
          return;
        }

        let remaining = preparationSeconds;
        setCountdown(remaining);
        setPhase("preparing");
        setStatusMessage(`Prepare your response. Recording starts in ${remaining} seconds.`);

        const tick = () => {
          if (generation !== generationRef.current) {
            return;
          }

          remaining -= 1;
          if (remaining <= 0) {
            beginRecording(stream, generation);
            return;
          }

          setCountdown(remaining);
          setStatusMessage(
            `Prepare your response. Recording starts in ${remaining} second${
              remaining === 1 ? "" : "s"
            }.`,
          );
          countdownTimerRef.current = window.setTimeout(tick, 1_000);
        };

        countdownTimerRef.current = window.setTimeout(tick, 1_000);
      } catch (captureError) {
        if (generation !== generationRef.current || !mountedRef.current) {
          return;
        }
        const failure = microphoneError(captureError);
        releaseCapture();
        setFailureKind(failure.kind);
        setError(failure.message);
        setPhase("failed");
        setStatusMessage("Microphone access failed.");
      }
    },
    [
      abandonActiveCapture,
      beginRecording,
      clearDraft,
      failCapture,
      isSupported,
      maxSeconds,
      preparationSeconds,
      releaseCapture,
    ],
  );

  const start = useCallback(() => requestCapture(false), [requestCapture]);

  const retry = useCallback(() => {
    if (failureKind === "storage" || failureKind === "history") {
      return Promise.resolve();
    }
    return requestCapture(true);
  }, [failureKind, requestCapture]);

  const cancel = useCallback(() => {
    abandonActiveCapture();
    clearDraft(true);
    saveInFlightRef.current = false;
    setIdleState();
  }, [abandonActiveCapture, clearDraft, setIdleState]);

  const save = useCallback(async () => {
    const draft = resultRef.current;
    if (!draft || saveInFlightRef.current || finalizedRef.current) {
      return;
    }

    const generation = generationRef.current;
    saveInFlightRef.current = true;
    setPendingAction("save");
    setFailureKind(null);
    setError("");
    setPhase("saving");
    setStatusMessage("Saving the response on this device.");

    let metadata = persistedMetadataRef.current;
    try {
      if (!metadata) {
        metadata = await recordingRepository.persistDraft(draft.id);
        persistedMetadataRef.current = metadata;
      }

      if (generation !== generationRef.current || !mountedRef.current) {
        if (!finalizedRef.current) {
          void recordingRepository.deleteRecording(metadata.id).catch(() => {
            // The component has gone away; leave the orphaned recording
            // recoverable rather than raising an unhandled rejection.
          });
        }
        return;
      }

      try {
        // Mark first so a synchronous parent navigation cannot treat this
        // already-committed audio as an abandoned orphan during unmount.
        finalizedRef.current = true;
        onSaveRef.current(metadata);
      } catch (callbackError) {
        finalizedRef.current = false;
        throw new RecordingStorageError(
          "write",
          "The audio is safe on this device, but the attempt could not be added to History. Try Save again.",
          { cause: callbackError },
        );
      }

      if (generation !== generationRef.current || !mountedRef.current) {
        return;
      }

      setFailureKind(null);
      setError("");
      setPhase("saved");
      setStatusMessage("Response saved locally and added to History.");
    } catch (saveError) {
      if (generation === generationRef.current && mountedRef.current) {
        const callbackFailed =
          persistedMetadataRef.current !== null &&
          saveError instanceof RecordingStorageError &&
          saveError.message.includes("History");
        setFailureKind(callbackFailed ? "history" : "storage");
        setError(storageErrorMessage(saveError));
        setPhase("failed");
        setStatusMessage(
          callbackFailed
            ? "Audio saved, but History could not be updated."
            : "The response could not be saved. The draft is still available.",
        );
      }
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) {
        setPendingAction(null);
      }
    }
  }, []);

  const discard = useCallback(async (): Promise<boolean> => {
    if (saveInFlightRef.current) {
      return false;
    }

    const persisted = persistedMetadataRef.current;
    setPendingAction("discard");
    setStatusMessage("Discarding the response draft.");

    if (persisted && !finalizedRef.current) {
      try {
        await recordingRepository.deleteRecording(persisted.id);
      } catch (deleteError) {
        if (mountedRef.current) {
          setFailureKind("discard");
          setError(
            deleteError instanceof Error
              ? deleteError.message
              : "The recording could not be removed from this device.",
          );
          setPhase("failed");
          setPendingAction(null);
          setStatusMessage("The recording could not be discarded.");
        }
        return false;
      }
    }

    abandonActiveCapture();
    clearDraft(false);
    if (mountedRef.current) {
      setIdleState();
      setStatusMessage("Draft discarded. Ready to record a new response.");
    }
    return true;
  }, [abandonActiveCapture, clearDraft, setIdleState]);

  const recordAgain = useCallback(async () => {
    const discarded = await discard();
    if (discarded && mountedRef.current) {
      await requestCapture(false);
    }
  }, [discard, requestCapture]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      abandonActiveCapture();
      clearDraft(true);
    },
    [abandonActiveCapture, clearDraft],
  );

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    if (phase !== "idle") {
      return;
    }
    setCountdown(preparationSeconds);
    setSecondsLeft(maxSeconds);
    setStatusMessage(`Ready to record a ${maxSeconds}-second response.`);
  }, [maxSeconds, phase, preparationSeconds]);

  return {
    phase,
    failureKind,
    countdown,
    secondsLeft,
    transcript,
    transcriptionPhase,
    transcriptionError,
    analysis,
    result,
    error,
    statusMessage,
    pendingAction,
    analyserRef,
    isSupported,
    isStopping,
    start,
    retry,
    stop,
    cancel,
    save,
    discard,
    recordAgain,
    reset,
  };
}
