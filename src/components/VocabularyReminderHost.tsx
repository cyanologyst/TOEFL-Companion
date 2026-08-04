import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyReviewAction,
  getNextReminderAt,
  pickNextWord,
} from "../features/vocabulary/vocabularyEngine";
import { useVocabularySnapshot } from "../hooks/useVocabularySnapshot";
import { isEditableTarget } from "../lib/keyboard";
import { createReviewEvent, vocabularyRepository } from "../services/vocabularyRepository";
import {
  playVocabularyCue,
  showSystemWordNotification,
  speakVocabulary,
} from "../services/vocabularyBrowser";
import type { ReviewAction, WordEntry } from "../types/vocabulary";
import { VocabularyReminder } from "./VocabularyReminder";

interface VocabularyReminderHostProps {
  onNotice: (message: string) => void;
}

function notificationUsesSystem(mode: string): boolean {
  return mode === "system" || mode === "toast" || mode === "both";
}

function notificationUsesPopup(mode: string): boolean {
  return mode === "popup" || mode === "both";
}

function navigateToVocabulary(section: string, wordId?: string): void {
  const params = new URLSearchParams({
    view: "vocabulary",
    section,
  });
  if (wordId) {
    params.set("word", wordId);
  }
  window.history.pushState(null, "", `#${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.requestAnimationFrame(() => {
    document.getElementById("main-content")?.focus({
      preventScroll: true,
    });
  });
}

export function VocabularyReminderHost({
  onNotice,
}: VocabularyReminderHostProps): React.JSX.Element | null {
  const snapshot = useVocabularySnapshot();
  const [activeWord, setActiveWord] = useState<WordEntry | null>(null);
  const shownAtRef = useRef(Date.now());
  const firingRef = useRef(false);

  const fireReminder = useCallback(() => {
    if (firingRef.current) {
      return;
    }
    firingRef.current = true;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const pausedUntil = snapshot.pausedUntil ? Date.parse(snapshot.pausedUntil) : Number.NaN;
      if (Number.isFinite(pausedUntil) && pausedUntil > now.getTime()) {
        vocabularyRepository.setNextReminderAt(new Date(pausedUntil).toISOString());
        return;
      }

      const nextAt = getNextReminderAt(snapshot.settings, nowIso);
      vocabularyRepository.setNextReminderAt(nextAt);
      const word = pickNextWord(snapshot.wordLists, snapshot.progress, snapshot.settings, nowIso);
      if (!word) {
        return;
      }

      if (notificationUsesSystem(snapshot.settings.notificationMode)) {
        showSystemWordNotification(word);
      }
      if (notificationUsesPopup(snapshot.settings.notificationMode)) {
        shownAtRef.current = Date.now();
        setActiveWord(word);
        playVocabularyCue(snapshot.settings.soundEnabled, "reminder");
      }
    } catch {
      onNotice("The next reminder could not be scheduled because local storage is unavailable.");
    } finally {
      firingRef.current = false;
    }
  }, [onNotice, snapshot]);

  useEffect(() => {
    if (snapshot.settings.notificationMode === "off") {
      if (snapshot.nextReminderAt) {
        vocabularyRepository.setNextReminderAt(null);
      }
      return;
    }

    const now = new Date();
    const pausedUntil = snapshot.pausedUntil ? Date.parse(snapshot.pausedUntil) : Number.NaN;
    let target = snapshot.nextReminderAt ? Date.parse(snapshot.nextReminderAt) : Number.NaN;

    if (Number.isFinite(pausedUntil) && pausedUntil > now.getTime()) {
      target = pausedUntil;
    } else if (!Number.isFinite(target)) {
      const firstTarget = getNextReminderAt(snapshot.settings, now.toISOString());
      try {
        vocabularyRepository.setNextReminderAt(firstTarget);
      } catch {
        onNotice("The reminder schedule could not be saved on this device.");
      }
      return;
    }

    const remaining = target - now.getTime();
    if (remaining <= 0) {
      const frame = window.setTimeout(fireReminder, 0);
      return () => window.clearTimeout(frame);
    }
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        fireReminder();
      }
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [fireReminder, snapshot.nextReminderAt, snapshot.pausedUntil, snapshot.settings, onNotice]);

  useEffect(() => {
    const catchUp = () => {
      if (
        document.visibilityState === "visible" &&
        snapshot.nextReminderAt &&
        Date.parse(snapshot.nextReminderAt) <= Date.now()
      ) {
        fireReminder();
      }
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("focus", catchUp);
    return () => {
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("focus", catchUp);
    };
  }, [fireReminder, snapshot.nextReminderAt]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (
        snapshot.settings.reviewShortcutEnabled &&
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
  }, [snapshot.settings.reviewShortcutEnabled]);

  const recordReview = useCallback(
    async (action: ReviewAction) => {
      if (!activeWord) {
        return;
      }
      const location = vocabularyRepository.findWord(activeWord.id, snapshot);
      if (!location) {
        setActiveWord(null);
        return;
      }
      const responseSeconds = Math.max(0, (Date.now() - shownAtRef.current) / 1000);
      const nowIso = new Date().toISOString();
      const progress = applyReviewAction(
        snapshot.progress[activeWord.id],
        activeWord.id,
        action,
        nowIso,
        responseSeconds,
      );
      try {
        vocabularyRepository.setProgress(
          activeWord.id,
          progress,
          createReviewEvent(location, action, responseSeconds),
        );
      } catch {
        onNotice("This reminder response could not be saved. The word remains open.");
        throw new Error("Reminder response could not be saved.");
      }
      playVocabularyCue(snapshot.settings.soundEnabled, action === "known" ? "known" : "later");
      setActiveWord(null);
    },
    [activeWord, onNotice, snapshot],
  );

  if (!activeWord) {
    return null;
  }

  return (
    <div className="vocab-reminder-layer">
      <VocabularyReminder
        word={activeWord}
        durationSeconds={snapshot.settings.popupDurationSeconds}
        compact={
          snapshot.settings.compactNotificationsWhenFullscreen &&
          document.fullscreenElement !== null
        }
        onReview={recordReview}
        onSnooze={(minutes) => {
          try {
            vocabularyRepository.snoozeWord(activeWord.id, minutes);
            setActiveWord(null);
          } catch {
            onNotice("This reminder could not be snoozed because local storage is unavailable.");
            throw new Error("Reminder could not be snoozed.");
          }
        }}
        onListen={() => speakVocabulary(activeWord.term, snapshot.settings)}
        onDetails={() => {
          navigateToVocabulary("library", activeWord.id);
          setActiveWord(null);
        }}
        onDismiss={() => setActiveWord(null)}
      />
    </div>
  );
}
