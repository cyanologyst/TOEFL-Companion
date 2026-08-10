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
  collectionTitle?: string;
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
const SNOOZE_CHOICES = [5, 15, 30] as const;

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA")
  );
}

/**
 * The vocabulary reminder.
 *
 * It asks before it tells. The old card printed the word and its meaning
 * together, which makes it a poster rather than practice: there is nothing to
 * retrieve if the answer is already on screen. Here the term arrives alone, the
 * learner recalls it, and only then does the meaning appear with the ratings
 * that feed the review schedule.
 *
 * The countdown runs only while the answer is still hidden. Once someone has
 * engaged with the card, taking it away mid-thought would be the rudest thing
 * it could do.
 */
export function VocabularyReminder({
  word,
  durationSeconds,
  compact,
  collectionTitle,
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

  const [revealed, setRevealed] = useState(false);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [restartToken, setRestartToken] = useState(0);

  const intervalRef = useRef<number | null>(null);
  const remainingRef = useRef(durationMs);
  const lastTickRef = useRef(performance.now());
  const pausedRef = useRef(false);
  const lockedRef = useRef(false);
  const revealedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const reminderId = useId();
  const titleId = `${reminderId}-title`;
  const bodyId = `${reminderId}-body`;

  const clearCountdown = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new word or a retry restarts the countdown on purpose.
  useEffect(() => {
    lockedRef.current = false;
    revealedRef.current = false;
    pausedRef.current = false;
    setIsActing(false);
    setFeedback(null);
    setRevealed(false);
    setRemainingMs(durationMs);
    remainingRef.current = durationMs;
    lastTickRef.current = performance.now();

    intervalRef.current = window.setInterval(() => {
      const now = performance.now();
      // Paused while hovered, focused, or once the answer is showing.
      if (pausedRef.current || revealedRef.current) {
        lastTickRef.current = now;
        return;
      }
      remainingRef.current = Math.max(0, remainingRef.current - (now - lastTickRef.current));
      lastTickRef.current = now;
      setRemainingMs(remainingRef.current);
      if (remainingRef.current <= 0 && !lockedRef.current) {
        lockedRef.current = true;
        clearCountdown();
        onDismissRef.current();
      }
    }, 200);

    return clearCountdown;
  }, [clearCountdown, durationMs, restartToken, word.id]);

  const reveal = useCallback(() => {
    if (lockedRef.current || revealedRef.current) {
      return;
    }
    revealedRef.current = true;
    setRevealed(true);
  }, []);

  const submitReview = useCallback(
    async (action: ReviewAction) => {
      if (lockedRef.current) {
        return;
      }
      lockedRef.current = true;
      clearCountdown();
      setIsActing(true);
      setFeedback(REVIEW_FEEDBACK[action]);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, FEEDBACK_DURATION_MS);
      });
      try {
        await onReview(action);
      } catch {
        lockedRef.current = false;
        setIsActing(false);
        setFeedback("Could not save");
        setRestartToken((value) => value + 1);
      }
    },
    [clearCountdown, onReview],
  );

  const snooze = useCallback(
    async (minutes: number) => {
      if (lockedRef.current) {
        return;
      }
      lockedRef.current = true;
      clearCountdown();
      setIsActing(true);
      try {
        await onSnooze(minutes);
      } catch {
        lockedRef.current = false;
        setIsActing(false);
        setFeedback("Could not snooze");
        setRestartToken((value) => value + 1);
      }
    },
    [clearCountdown, onSnooze],
  );

  const dismiss = useCallback(() => {
    if (lockedRef.current) {
      return;
    }
    lockedRef.current = true;
    clearCountdown();
    onDismiss();
  }, [clearCountdown, onDismiss]);

  const showDetails = useCallback(async () => {
    if (lockedRef.current) {
      return;
    }
    lockedRef.current = true;
    clearCountdown();
    setIsActing(true);
    try {
      await onDetails();
    } catch {
      lockedRef.current = false;
      setIsActing(false);
      setFeedback("Could not open details");
      setRestartToken((value) => value + 1);
    }
  }, [clearCountdown, onDetails]);

  const meta = useMemo(
    () =>
      [word.partOfSpeech, word.pronunciation]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" · "),
    [word.partOfSpeech, word.pronunciation],
  );
  const example = word.exampleSentences.find((sentence) => Boolean(sentence.trim()));
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

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

    const key = event.key.toLowerCase();
    if (!revealed && (key === " " || key === "enter")) {
      event.preventDefault();
      reveal();
      return;
    }
    if (revealed && (key === "1" || key === "2" || key === "3")) {
      event.preventDefault();
      void submitReview(key === "1" ? "known" : key === "2" ? "later" : "skipped");
      return;
    }
    if (key === "s") {
      event.preventDefault();
      void snooze(15);
      return;
    }
    if (key === "l") {
      event.preventDefault();
      void onListen();
      return;
    }
    if (key === "escape") {
      event.preventDefault();
      dismiss();
    }
  };

  return (
    <section
      className={`vocab-reminder${compact ? " vocab-reminder--compact" : ""}`}
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-revealed={revealed}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => {
        pausedRef.current = true;
      }}
      onPointerLeave={() => {
        pausedRef.current = false;
        lastTickRef.current = performance.now();
      }}
      onFocusCapture={() => {
        pausedRef.current = true;
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          pausedRef.current = false;
          lastTickRef.current = performance.now();
        }
      }}
    >
      {/* The bar is the timer. It stops when the answer is showing, so the card
          never disappears out from under someone who is thinking. */}
      <progress
        className="vocab-reminder-progress"
        max={durationMs}
        value={revealed ? durationMs : remainingMs}
        aria-label={`Reminder closes in ${formatCount(remainingSeconds, "second")}`}
      />

      <div className="vocab-reminder-bar">
        <span className="b-tag">
          <BellIcon size={14} weight="bold" aria-hidden />
          {collectionTitle ?? "Vocabulary"}
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
            <SpeakerHighIcon size={18} weight="regular" aria-hidden />
          </button>
          <button
            type="button"
            className="vocab-reminder-icon-button"
            onClick={dismiss}
            aria-label="Dismiss vocabulary reminder"
            aria-keyshortcuts="Escape"
            disabled={isActing}
          >
            <XIcon size={18} weight="regular" aria-hidden />
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

      <div className="vocab-reminder-content" id={bodyId}>
        {revealed ? (
          <>
            <p className="vocab-reminder-meaning" dir="auto">
              {word.shortMeaning?.trim() || "No meaning has been added yet."}
            </p>
            {!compact && example ? <p className="vocab-reminder-example">“{example}”</p> : null}
          </>
        ) : (
          /* Retrieval is the practice. Nothing here gives the answer away. */
          <button type="button" className="vocab-reminder-recall" onClick={reveal}>
            <strong>Do you remember it?</strong>
            <small>Say the meaning, then check.</small>
          </button>
        )}
      </div>

      {revealed ? (
        <fieldset className="vocab-reminder-review-actions">
          <legend className="sr-only">Rate your recall</legend>
          <button
            type="button"
            className="b-btn b-btn--mint vocab-reminder-action"
            onClick={() => void submitReview("known")}
            aria-keyshortcuts="1"
            disabled={isActing}
          >
            <CheckIcon size={16} weight="bold" aria-hidden />
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
            <ClockCounterClockwiseIcon size={16} weight="regular" aria-hidden />
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
            <XIcon size={16} weight="regular" aria-hidden />
            <span>Forgot</span>
            <kbd aria-hidden>3</kbd>
          </button>
        </fieldset>
      ) : (
        <div className="vocab-reminder-reveal-row">
          <button
            type="button"
            className="b-btn b-btn--lime b-btn--block"
            onClick={reveal}
            aria-keyshortcuts="Enter"
            disabled={isActing}
          >
            Show meaning
          </button>
        </div>
      )}

      <div className="vocab-reminder-secondary-actions">
        <fieldset className="vocab-reminder-snooze">
          <legend className="sr-only">Snooze reminder</legend>
          <span className="vocab-reminder-snooze-label">
            Snooze
            <kbd aria-hidden>S</kbd>
          </span>
          {SNOOZE_CHOICES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="vocab-reminder-snooze-button"
              onClick={() => void snooze(minutes)}
              aria-label={`Snooze for ${minutes} minutes`}
              aria-keyshortcuts={minutes === 15 ? "S" : undefined}
              disabled={isActing}
            >
              {minutes}m
            </button>
          ))}
        </fieldset>

        <button
          type="button"
          className="vocab-reminder-details-button"
          onClick={() => void showDetails()}
          disabled={isActing}
        >
          <InfoIcon size={17} weight="regular" aria-hidden />
          Details
        </button>
      </div>

      <span className="vocab-reminder-feedback" role="status" aria-live="polite">
        {feedback}
      </span>
      <span className="vocab-reminder-sr-only">
        This reminder closes automatically after {safeDurationSeconds} seconds while the meaning is
        hidden. Hovering over it, moving keyboard focus inside, or showing the meaning pauses the
        timer.
      </span>
    </section>
  );
}
