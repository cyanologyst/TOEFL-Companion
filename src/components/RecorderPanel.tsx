import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { MicrophoneIcon } from "@phosphor-icons/react/Microphone";
import { StopIcon } from "@phosphor-icons/react/Stop";
import { useEffect, useRef } from "react";
import { useSpeakingRecorder } from "../hooks/useSpeakingRecorder";
import { formatCount } from "../lib/format";
import { isEditableTarget } from "../lib/keyboard";
import { countWords } from "../lib/question";
import type { RecorderPhase, SavedRecordingMetadata } from "../types/toefl";
import { AudioWaveform } from "./AudioWaveform";

interface RecorderPanelProps {
  questionKey: string;
  onSave: (result: SavedRecordingMetadata) => void;
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function isWaitingPhase(phase: RecorderPhase): boolean {
  return phase === "requesting" || phase === "retrying" || phase === "preparing";
}

export function RecorderPanel({ onSave }: RecorderPanelProps): React.JSX.Element {
  const recorder = useSpeakingRecorder({ onSave });
  const panelRef = useRef<HTMLElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const recordAgainButtonRef = useRef<HTMLButtonElement>(null);
  const previousPhaseRef = useRef(recorder.phase);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    if (recorder.phase === "recording") {
      stopButtonRef.current?.focus();
    } else if (recorder.phase === "completed") {
      saveButtonRef.current?.focus();
    } else if (recorder.phase === "failed") {
      if (recorder.result) {
        saveButtonRef.current?.focus();
      } else {
        retryButtonRef.current?.focus();
      }
    } else if (isWaitingPhase(recorder.phase)) {
      cancelButtonRef.current?.focus();
    } else if (recorder.phase === "saved") {
      recordAgainButtonRef.current?.focus();
    } else if (recorder.phase === "idle" && previousPhase !== "idle") {
      startButtonRef.current?.focus();
    }
    previousPhaseRef.current = recorder.phase;
  }, [recorder.phase, recorder.result]);

  const wordCount = countWords(recorder.transcript);
  const resultIsVisible =
    recorder.result !== null &&
    (recorder.phase === "completed" ||
      recorder.phase === "saving" ||
      recorder.phase === "saved" ||
      recorder.phase === "failed");
  const busy =
    recorder.phase === "requesting" ||
    recorder.phase === "retrying" ||
    recorder.phase === "saving" ||
    recorder.pendingAction !== null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (
      event.key === "Escape" &&
      (recorder.phase === "requesting" ||
        recorder.phase === "retrying" ||
        recorder.phase === "preparing")
    ) {
      event.preventDefault();
      event.stopPropagation();
      recorder.cancel();
      return;
    }

    if (
      event.code !== "Space" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-recorder-space-action]")
        : null;
    if (!target || !panelRef.current?.contains(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) {
      return;
    }

    const action = target.dataset.recorderSpaceAction;
    if (action === "start" && recorder.phase === "idle") {
      void recorder.start();
    } else if (action === "retry" && recorder.phase === "failed" && !recorder.result) {
      void recorder.retry();
    } else if (action === "stop" && recorder.phase === "recording") {
      recorder.stop();
    } else if (action === "again" && recorder.phase === "saved") {
      void recorder.recordAgain();
    }
  };

  const restartRecording = (): void => {
    recorder.cancel();
    void recorder.start();
  };

  return (
    <section
      className="recorder-panel"
      aria-label="Speaking response recorder"
      aria-busy={busy}
      data-phase={recorder.phase}
      data-unavailable={recorder.failureKind === "unsupported"}
      onKeyDownCapture={handleKeyDown}
      ref={panelRef}
    >
      <p className="response-time-note">
        <ClockIcon size={22} weight="regular" aria-hidden />
        You have 45 seconds to respond.
      </p>

      {recorder.phase === "idle" ? (
        <button
          type="button"
          className="response-cta"
          onClick={() => void recorder.start()}
          aria-keyshortcuts="Space"
          data-recorder-space-action="start"
          ref={startButtonRef}
        >
          <MicrophoneIcon size={44} weight="regular" aria-hidden />
          <strong>Start 45-second response</strong>
          <span className="cta-divider" aria-hidden />
          <span className="cta-timer">00:45</span>
        </button>
      ) : null}

      {recorder.phase === "requesting" || recorder.phase === "retrying" ? (
        <>
          <div className="response-cta response-cta--status" role="status">
            <span className="permission-pulse" aria-hidden />
            <strong>
              {recorder.phase === "retrying"
                ? "Trying the microphone again"
                : "Connecting to your microphone"}
            </strong>
            <span className="cta-divider" aria-hidden />
            <span className="cta-timer">Please wait</span>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={recorder.cancel}
            aria-keyshortcuts="Escape"
            ref={cancelButtonRef}
          >
            Cancel
          </button>
        </>
      ) : null}

      {recorder.phase === "preparing" ? (
        <button
          type="button"
          className="response-cta response-cta--countdown"
          onClick={recorder.cancel}
          aria-label={`Recording starts in ${formatCount(
            recorder.countdown,
            "second",
          )}. Cancel preparation.`}
          aria-keyshortcuts="Escape"
          ref={cancelButtonRef}
        >
          <span className="countdown-number" aria-hidden>
            {recorder.countdown}
          </span>
          <strong>Prepare your response</strong>
          <span className="cta-divider" aria-hidden />
          <span className="cta-timer">Cancel</span>
        </button>
      ) : null}

      {recorder.phase === "recording" ? (
        <div className="response-cta response-cta--recording">
          <div className="recording-live-row">
            <AudioWaveform analyserRef={recorder.analyserRef} active={!recorder.isStopping} />
            <span className="cta-timer" role="timer" aria-label="Time remaining">
              {formatTime(recorder.secondsLeft)}
            </span>
          </div>
          <div className="recording-live-actions">
            <button
              type="button"
              className="recording-stop"
              onClick={recorder.stop}
              disabled={recorder.isStopping}
              aria-keyshortcuts="Space"
              data-recorder-space-action="stop"
              ref={stopButtonRef}
            >
              <StopIcon size={17} weight="fill" aria-hidden />
              {recorder.isStopping ? "Finishing…" : "Stop"}
            </button>
            <button
              type="button"
              className="recording-restart"
              onClick={restartRecording}
              disabled={recorder.isStopping}
            >
              <ArrowCounterClockwiseIcon size={17} aria-hidden />
              Restart
            </button>
          </div>
        </div>
      ) : null}

      {resultIsVisible && recorder.result ? (
        <div className="recording-result">
          <div className="recording-result-heading">
            <CheckCircleIcon size={26} weight="fill" aria-hidden />
            <div>
              <strong>
                {recorder.phase === "saved"
                  ? "Response saved locally"
                  : recorder.phase === "saving"
                    ? "Saving response"
                    : "Response ready to save"}
              </strong>
              <span>
                {recorder.result.durationSeconds} sec ·{" "}
                {recorder.transcript ? formatCount(wordCount, "word") : "audio ready"}
              </span>
            </div>
          </div>

          {/* biome-ignore lint/a11y/useMediaCaption: This is the learner's own speech recording; a live transcript is shown beside it when available. */}
          <audio
            className="recording-audio"
            controls
            preload="metadata"
            src={recorder.result.url}
            aria-label="Playback of your recorded TOEFL response"
          />

          {recorder.transcript ? (
            <details className="transcript-details">
              <summary>Review live transcript</summary>
              <p>{recorder.transcript}</p>
            </details>
          ) : (
            <p className="transcript-unavailable">
              Live transcription was unavailable. Your audio is still ready to review and save.
            </p>
          )}

          {recorder.phase === "failed" && recorder.error ? (
            <div className="recorder-error" role="alert">
              <strong>
                {recorder.failureKind === "history"
                  ? "History needs attention"
                  : recorder.failureKind === "discard"
                    ? "Couldn’t discard this response"
                    : "Couldn’t save this response"}
              </strong>
              <p>{recorder.error}</p>
            </div>
          ) : null}

          {recorder.phase === "saved" ? (
            <div className="history-dialog-actions">
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => void recorder.recordAgain()}
                aria-keyshortcuts="Space"
                data-recorder-space-action="again"
                ref={recordAgainButtonRef}
              >
                <ArrowCounterClockwiseIcon size={18} aria-hidden />
                Record another response
              </button>
            </div>
          ) : (
            <div className="history-dialog-actions">
              <button
                type="button"
                className="ui-button ui-button--primary"
                onClick={() => void recorder.save()}
                disabled={recorder.pendingAction !== null}
                ref={saveButtonRef}
              >
                {recorder.pendingAction === "save"
                  ? "Saving…"
                  : recorder.failureKind === "history" || recorder.failureKind === "storage"
                    ? "Try Save again"
                    : "Save response"}
              </button>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => void recorder.discard()}
                disabled={recorder.pendingAction !== null}
              >
                {recorder.pendingAction === "discard" ? "Discarding…" : "Discard"}
              </button>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => void recorder.recordAgain()}
                disabled={recorder.pendingAction !== null}
              >
                <ArrowCounterClockwiseIcon size={18} aria-hidden />
                Record again
              </button>
            </div>
          )}
        </div>
      ) : null}

      {recorder.phase === "failed" && !recorder.result ? (
        <div className="recorder-error" role="alert">
          <strong>
            {recorder.failureKind === "permission"
              ? "Microphone access needed"
              : recorder.failureKind === "unsupported"
                ? "Recording unavailable"
                : "Recording failed"}
          </strong>
          <p>{recorder.error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void recorder.retry()}
            aria-keyshortcuts="Space"
            data-recorder-space-action="retry"
            ref={retryButtonRef}
          >
            Try again
          </button>
        </div>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {recorder.statusMessage}
      </span>
    </section>
  );
}
