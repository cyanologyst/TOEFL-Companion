import { useCallback, useEffect, useRef, useState } from "react";
import { applyReviewAction } from "../features/vocabulary/vocabularyEngine";
import { useVocabularySnapshot } from "../hooks/useVocabularySnapshot";
import { isEditableTarget } from "../lib/keyboard";
import { decideReminder, isInterruptible } from "../services/reminderScheduler";
import { createReviewEvent, vocabularyRepository } from "../services/vocabularyRepository";
import type { WordLocation } from "../services/vocabularyRepository";
import {
  playVocabularyCue,
  showSystemWordNotification,
  speakVocabulary,
} from "../services/vocabularyBrowser";
import type { ReviewAction } from "../types/vocabulary";
import { VocabularyReminder } from "./VocabularyReminder";

interface VocabularyReminderHostProps {
  onNotice: (message: string) => void;
}

/** One steady heartbeat instead of a timer rebuilt on every state change. */
const TICK_MS = 1_000;

function usesSystemNotifications(mode: string): boolean {
  return mode === "system" || mode === "toast" || mode === "both";
}

function usesInAppCard(mode: string): boolean {
  return mode === "popup" || mode === "both";
}

function navigateToVocabulary(section: string, wordId?: string): void {
  const params = new URLSearchParams({ view: "vocabulary", section });
  if (wordId) {
    params.set("word", wordId);
  }
  window.history.pushState(null, "", `#${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.requestAnimationFrame(() => {
    document.getElementById("main-content")?.focus({ preventScroll: true });
  });
}

/**
 * Drives the vocabulary reminder.
 *
 * The scheduler decides *whether* and *what*; this component only carries out
 * the decision and owns the card's lifetime. Everything it needs to read is
 * held in a ref, so the heartbeat is installed once and is not disturbed by
 * the vocabulary snapshot changing underneath it - which is what previously
 * let a review session reset the countdown indefinitely.
 */
export function VocabularyReminderHost({
  onNotice,
}: VocabularyReminderHostProps): React.JSX.Element | null {
  const snapshot = useVocabularySnapshot();
  const [active, setActive] = useState<WordLocation | null>(null);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const activeRef = useRef<WordLocation | null>(null);
  activeRef.current = active;
  const lastWordIdRef = useRef<string | null>(null);
  const shownAtRef = useRef(0);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    const tick = () => {
      const current = snapshotRef.current;
      const decision = decideReminder({
        snapshot: current,
        nowMs: Date.now(),
        showing: activeRef.current !== null,
        interruptible: isInterruptible(),
        lastWordId: lastWordIdRef.current,
      });

      try {
        switch (decision.kind) {
          case "wait":
            return;
          case "schedule":
          case "defer":
            vocabularyRepository.setNextReminderAt(
              decision.kind === "schedule" ? decision.at : decision.at,
            );
            return;
          case "fire": {
            vocabularyRepository.setNextReminderAt(decision.nextAt);
            lastWordIdRef.current = decision.location.word.id;
            shownAtRef.current = Date.now();

            if (usesSystemNotifications(current.settings.notificationMode)) {
              showSystemWordNotification(decision.location.word);
            }
            if (usesInAppCard(current.settings.notificationMode)) {
              setActive(decision.location);
              playVocabularyCue(current.settings.soundEnabled, "reminder");
            }
            return;
          }
        }
      } catch {
        onNoticeRef.current(
          "The next vocabulary reminder could not be scheduled because local storage is unavailable.",
        );
      }
    };

    // Run once immediately so a due reminder does not wait a full tick after
    // the window is reopened.
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (
        snapshotRef.current.settings.reviewShortcutEnabled &&
        !event.defaultPrevented &&
        !event.repeat &&
        !isEditableTarget(event.target) &&
        !document.querySelector("[role='dialog']") &&
        event.ctrlKey &&
        event.altKey &&
        !event.metaKey &&
        event.key.toLocaleLowerCase() === "r"
      ) {
        event.preventDefault();
        navigateToVocabulary("review");
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const recordReview = useCallback(async (action: ReviewAction) => {
    const location = activeRef.current;
    if (!location) {
      return;
    }

    const current = snapshotRef.current;
    const responseSeconds = Math.max(0, (Date.now() - shownAtRef.current) / 1_000);
    const nowIso = new Date().toISOString();
    const progress = applyReviewAction(
      current.progress[location.word.id],
      location.word.id,
      action,
      nowIso,
      responseSeconds,
    );

    try {
      vocabularyRepository.setProgress(
        location.word.id,
        progress,
        createReviewEvent(location, action, responseSeconds),
      );
    } catch {
      onNoticeRef.current("This reminder response could not be saved. The word remains open.");
      throw new Error("Reminder response could not be saved.");
    }

    playVocabularyCue(current.settings.soundEnabled, action === "known" ? "known" : "later");
    setActive(null);
  }, []);

  if (!active) {
    return null;
  }

  return (
    <div className="vocab-reminder-layer b-portal">
      <VocabularyReminder
        word={active.word}
        collectionTitle={active.list.title}
        durationSeconds={snapshot.settings.popupDurationSeconds}
        compact={
          snapshot.settings.compactNotificationsWhenFullscreen &&
          document.fullscreenElement !== null
        }
        onReview={recordReview}
        onSnooze={(minutes) => {
          try {
            vocabularyRepository.snoozeWord(active.word.id, minutes);
            setActive(null);
          } catch {
            onNoticeRef.current(
              "This reminder could not be snoozed because local storage is unavailable.",
            );
            throw new Error("Reminder could not be snoozed.");
          }
        }}
        onListen={() => speakVocabulary(active.word.term, snapshot.settings)}
        onDetails={() => {
          navigateToVocabulary("library", active.word.id);
          setActive(null);
        }}
        onDismiss={() => setActive(null)}
      />
    </div>
  );
}
