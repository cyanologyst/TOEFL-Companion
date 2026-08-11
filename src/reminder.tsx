import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/space-grotesk/wght.css";
import { VocabularyReminder } from "./components/VocabularyReminder";
import { applyReviewAction } from "./features/vocabulary/vocabularyEngine";
import {
  createReviewEvent,
  vocabularyRepository,
  type WordLocation,
} from "./services/vocabularyRepository";
import { speakVocabulary } from "./services/vocabularyBrowser";
import type { ReviewAction } from "./types/vocabulary";
import "./brutal.css";
import "./reminder-window.css";

/**
 * The reminder popup, running in its own desktop window.
 *
 * It is a separate entry rather than a route in the app, so opening a reminder
 * does not boot the whole workspace behind it. It shares the app's local
 * storage, which is how a rating given here reaches the library.
 */
function ReminderWindow(): React.JSX.Element | null {
  const [location, setLocation] = useState<WordLocation | null>(null);
  const [missing, setMissing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const shownAtRef = useRef(Date.now());

  useEffect(() => {
    const wordId = new URLSearchParams(window.location.search).get("word");
    if (!wordId) {
      setMissing(true);
      return;
    }
    const found = vocabularyRepository.findWord(wordId);
    if (!found) {
      setMissing(true);
      return;
    }
    setLocation(found);
    shownAtRef.current = Date.now();
  }, []);

  const close = useCallback(() => {
    void invoke("close_reminder_popup").catch(() => {
      window.close();
    });
  }, []);

  // The window is created at a guessed height; the card knows its real one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the card only exists once a word is loaded, so the ref is empty until `location` changes.
  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) {
      return;
    }
    const report = () => {
      const height = node.getBoundingClientRect().height;
      if (height > 0) {
        void invoke("resize_reminder_popup", { height }).catch(() => {
          // A failed resize only costs a little empty space.
        });
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [location]);

  useEffect(() => {
    if (missing) {
      close();
    }
  }, [missing, close]);

  if (!location) {
    return null;
  }

  const settings = vocabularyRepository.getSnapshot().settings;

  return (
    <div className="reminder-window__card" ref={cardRef}>
      <VocabularyReminder
        word={location.word}
        collectionTitle={location.list.title}
        durationSeconds={settings.popupDurationSeconds}
        compact={false}
        onReview={async (action: ReviewAction) => {
          const responseSeconds = Math.max(0, (Date.now() - shownAtRef.current) / 1_000);
          const snapshot = vocabularyRepository.getSnapshot();
          const progress = applyReviewAction(
            snapshot.progress[location.word.id],
            location.word.id,
            action,
            new Date().toISOString(),
            responseSeconds,
          );
          vocabularyRepository.setProgress(
            location.word.id,
            progress,
            createReviewEvent(location, action, responseSeconds),
          );
          close();
        }}
        onSnooze={(minutes) => {
          vocabularyRepository.snoozeWord(location.word.id, minutes);
          close();
        }}
        onListen={() => speakVocabulary(location.word.term, settings)}
        onDetails={() => {
          // The main window owns navigation; a marker in storage is the
          // simplest thing both windows already watch.
          window.localStorage.setItem(
            "toefl-companion:open-word",
            JSON.stringify({ id: location.word.id, at: Date.now() }),
          );
          close();
        }}
        onDismiss={close}
      />
    </div>
  );
}

const root = document.getElementById("reminder-root");
if (root) {
  createRoot(root).render(<ReminderWindow />);
}
