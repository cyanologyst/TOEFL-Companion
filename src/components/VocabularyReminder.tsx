import { BellIcon } from "@phosphor-icons/react/Bell";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ClockCounterClockwise";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { SpeakerHighIcon } from "@phosphor-icons/react/SpeakerHigh";
import { XIcon } from "@phosphor-icons/react/X";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatCount } from "../lib/format";
import type { ReviewAction, WordEntry } from "../types/vocabulary";

interface VocabularyReminderProps {
  word: WordEntry;
  durationSeconds: number;
  compact: boolean;
  onReview: (action: ReviewAction) => void | Promise<void>;
  onSnooze: (minutes: number) => void | Promise<void>;
  onListen: () => void | Promise<void>;
  onDetails: () => void | Promise<void>;
  onDismiss: () => void;
}

const REVIEW_FEEDBACK: Record<ReviewAction, string> = {
  known: "Marked known",
  later: "Saved for later",
  skipped: "Skipped",
};

const FEEDBACK_DURATION_MS = 360;

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA")
  );
}

export function VocabularyReminder({
  word,
  durationSeconds,
  compact,
  onReview,
  onSnooze,
  onListen,
  onDetails,
  onDismiss,
}: VocabularyReminderProps): React.JSX.Element {
  const safeDurationSeconds = Number.isFinite(durationSeconds)
    ? Math.max(5, Math.trunc(durationSeconds))
    : 5;
  const durationMs = safeDurationSeconds * 1000;
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [countdownRestartToken, setCountdownRestartToken] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const intervalRef = useRef<number | null>(null);
  const remainingMsRef = useRef(durationMs);
  const lastTickRef = useRef(performance.now());
  const countdownPausedRef = useRef(false);
  const actionLockedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const reminderId = useId();

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearCountdown = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new word or restart token intentionally starts a fresh countdown.
  useEffect(() => {
    actionLockedRef.current = false;
    setIsActing(false);
    setFeedback(null);
    setRemainingMs(durationMs);

    remainingMsRef.current = durationMs;
    lastTickRef.current = performance.now();
    countdownPausedRef.current = false;
    intervalRef.current = window.setInterval(() => {
      const now = performance.now();
      if (countdownPausedRef.current) {
        lastTickRef.current = now;
        return;
      }

      remainingMsRef.current = Math.max(0, remainingMsRef.current - (now - lastTickRef.current));
      lastTickRef.current = now;
      setRemainingMs(remainingMsRef.current);

      if (remainingMsRef.current <= 0 && !actionLockedRef.current) {
        actionLockedRef.current = true;
        clearCountdown();
        onDismissRef.current();
      }
    }, 200);

    return clearCountdown;
  }, [clearCountdown, countdownRestartToken, durationMs, word.id]);

  const submitReview = useCallback(
    async (action: ReviewAction) => {
      if (actionLockedRef.current) {
        return;
      }

      actionLockedRef.current = true;
      clearCountdown();
      setIsActing(true);
      setFeedback(REVIEW_FEEDBACK[action]);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, FEEDBACK_DURATION_MS);
      });
      try {
        await onReview(action);
      } catch {
        actionLockedRef.current = false;
        setIsActing(false);
        setFeedback("Could not save");
        setCountdownRestartToken((current) => current + 1);
      }
    },
    [clearCountdown, onReview],
  );

  const snooze = useCallback(
    async (minutes: number) => {
      if (actionLockedRef.current) {
        return;
      }

      actionLockedRef.current = true;
      clearCountdown();
      setIsActing(true);
      try {
        await onSnooze(minutes);
      } catch {
        actionLockedRef.current = false;
        setIsActing(false);
        setFeedback("Could not snooze");
        setCountdownRestartToken((current) => current + 1);
      }
    },
    [clearCountdown, onSnooze],
  );

  const dismiss = useCallback(() => {
    if (actionLockedRef.current) {
      return;
    }

    actionLockedRef.current = true;
    clearCountdown();
    onDismiss();
  }, [clearCountdown, onDismiss]);

  const showDetails = useCallback(async () => {
    if (actionLockedRef.current) {
      return;
    }

    actionLockedRef.current = true;
    clearCountdown();
    setIsActing(true);
    try {
      await onDetails();
    } catch {
      actionLockedRef.current = false;
      setIsActing(false);
      setFeedback("Could not open details");
      setCountdownRestartToken((current) => current + 1);
    }
  }, [clearCountdown, onDetails]);

  const meta = useMemo(
    () =>
      [word.partOfSpeech, word.pronunciation]
        .filter((value): value is string => Boolean(value?.trim()))
        .join("  "),
    [word.partOfSpeech, word.pronunciation],
  );
  const firstExample = word.exampleSentences.find((example) => Boolean(example.trim()));
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const titleId = `${reminderId}-title`;
  const descriptionId = `${reminderId}-description`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      isActing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isEditableTarget(event.target)
    ) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case "1":
        event.preventDefault();
        void submitReview("known");
        break;
      case "2":
        event.preventDefault();
        void submitReview("later");
        break;
      case "3":
        event.preventDefault();
        void submitReview("skipped");
        break;
      case "s":
        event.preventDefault();
        void snooze(15);
        break;
      case "l":
        event.preventDefault();
        void onListen();
        break;
      case "escape":
        event.preventDefault();
        dismiss();
        break;
    }
  };

  return (
    <section
      ref={dialogRef}
      className={`vocab-reminder${compact ? " vocab-reminder--compact" : ""}`}
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => {
        countdownPausedRef.current = true;
      }}
      onPointerLeave={() => {
        countdownPausedRef.current = false;
        lastTickRef.current = performance.now();
      }}
      onFocusCapture={() => {
        countdownPausedRef.current = true;
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          countdownPausedRef.current = false;
          lastTickRef.current = performance.now();
        }
      }}
    >
      <progress
        className="vocab-reminder-progress"
        max={durationMs}
        value={remainingMs}
        aria-label={`Reminder closes in ${formatCount(remainingSeconds, "second")}`}
      />

      {/* What this interruption is belongs in the card's own chrome, beside
          its controls — not stacked above the word as a label. */}
      <div className="vocab-reminder-bar">
        <span className="b-tag">
          <BellIcon size={14} weight="bold" aria-hidden />
          Vocabulary reminder
        </span>
        <div className="vocab-reminder-header-actions">
          <button
            type="button"
            className="vocab-reminder-icon-button"
            onClick={() => void onListen()}
            aria-label={`Listen to ${word.term}`}
            aria-keyshortcuts="L"
            disabled={isActing}
          >
            <SpeakerHighIcon size={19} weight="regular" aria-hidden />
          </button>
          <button
            type="button"
            className="vocab-reminder-icon-button"
            onClick={dismiss}
            aria-label="Dismiss vocabulary reminder"
            aria-keyshortcuts="Escape"
            disabled={isActing}
          >
            <XIcon size={19} weight="regular" aria-hidden />
          </button>
        </div>
      </div>

      <header className="vocab-reminder-header">
        <div className="vocab-reminder-heading">
          <h2 className="vocab-reminder-term" id={titleId}>
            {word.term}
          </h2>
          {meta ? <p className="vocab-reminder-meta">{meta}</p> : null}
        </div>
      </header>

      <div className="vocab-reminder-content" id={descriptionId}>
        <p className="vocab-reminder-meaning" dir="auto">
          {word.shortMeaning?.trim() || "No meaning has been added yet."}
        </p>
        {!compact && firstExample ? (
          <p className="vocab-reminder-example">
            <span className="vocab-reminder-example-label">Example</span>
            {firstExample}
          </p>
        ) : null}
      </div>

      <fieldset className="vocab-reminder-review-actions">
        <legend className="sr-only">Rate your recall</legend>
        <button
          type="button"
          className="b-btn b-btn--mint vocab-reminder-action"
          onClick={() => void submitReview("known")}
          aria-keyshortcuts="1"
          disabled={isActing}
        >
          <CheckIcon size={17} weight="bold" aria-hidden />
          <span>Known</span>
          <kbd aria-hidden>1</kbd>
        </button>
        <button
          type="button"
          className="b-btn b-btn--sky vocab-reminder-action"
          onClick={() => void submitReview("later")}
          aria-keyshortcuts="2"
          disabled={isActing}
        >
          <ClockCounterClockwiseIcon size={17} weight="regular" aria-hidden />
          <span>Later</span>
          <kbd aria-hidden>2</kbd>
        </button>
        <button
          type="button"
          className="b-btn b-btn--rose vocab-reminder-action"
          onClick={() => void submitReview("skipped")}
          aria-keyshortcuts="3"
          disabled={isActing}
        >
          <XIcon size={17} weight="regular" aria-hidden />
          <span>Skip</span>
          <kbd aria-hidden>3</kbd>
        </button>
      </fieldset>

      <div className="vocab-reminder-secondary-actions">
        <fieldset className="vocab-reminder-snooze">
          <legend className="sr-only">Snooze reminder</legend>
          <span className="vocab-reminder-snooze-label">
            Snooze
            <kbd aria-hidden>S</kbd>
          </span>
          {[5, 15, 30].map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="vocab-reminder-snooze-button"
              onClick={() => void snooze(minutes)}
              aria-label={`Snooze for ${minutes} minutes`}
              aria-keyshortcuts={minutes === 15 ? "S" : undefined}
              disabled={isActing}
            >
              {minutes} min
            </button>
          ))}
        </fieldset>

        <button
          type="button"
          className="vocab-reminder-details-button"
          onClick={() => void showDetails()}
          disabled={isActing}
        >
          <InfoIcon size={18} weight="regular" aria-hidden />
          Details
        </button>
      </div>

      <p className="vocab-reminder-countdown" aria-hidden>{`${remainingSeconds}s`}</p>
      <span className="vocab-reminder-feedback" role="status" aria-live="polite">
        {feedback}
      </span>
      <span className="vocab-reminder-sr-only">
        This reminder closes automatically after {safeDurationSeconds} seconds of inactivity.
        Hovering over it or moving keyboard focus inside pauses the timer.
      </span>
    </section>
  );
}
