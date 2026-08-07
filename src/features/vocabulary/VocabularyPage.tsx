import { useMemo, useRef, useState } from "react";
import { DoodleIcon } from "../../components/DoodleIcon";
import { VocabularyLibrary } from "../../components/VocabularyLibrary";
import { applyReviewAction, calculateVocabularyStats } from "./vocabularyEngine";
import { useVocabularySnapshot } from "../../hooks/useVocabularySnapshot";
import { createReviewEvent, vocabularyRepository } from "../../services/vocabularyRepository";
import { studyRepository } from "../../services/studyRepository";
import { speakVocabulary } from "../../services/vocabularyBrowser";
import type { ReviewAction } from "../../types/vocabulary";

type VocabularyView = "library" | "review";

interface VocabularyPageProps {
  initialView?: VocabularyView;
  initialWordId?: string;
  onNotice: (message: string) => void;
  onOpenLibrary?: () => void;
  onOpenSettings?: () => void;
}

function openSettingsByHash(): void {
  window.history.pushState(null, "", "#view=settings");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function VocabularyPage({
  initialView = "library",
  initialWordId,
  onNotice,
  onOpenLibrary,
  onOpenSettings,
}: VocabularyPageProps): React.JSX.Element {
  const snapshot = useVocabularySnapshot();
  const [view, setView] = useState<VocabularyView>(initialView);

  const stats = useMemo(
    () =>
      calculateVocabularyStats(
        snapshot.wordLists,
        snapshot.progress,
        snapshot.events,
        new Date().toISOString(),
        snapshot.settings.dailyReviewGoal,
      ),
    [snapshot],
  );

  /* One library surface serves both entry points; this page only decides which
     of the two vocabulary jobs the learner is doing. */
  if (view === "library") {
    return (
      <VocabularyLibrary
        snapshot={snapshot}
        initialWordId={initialWordId}
        onNotice={onNotice}
        onOpenReview={() => setView("review")}
        onOpenSettings={onOpenSettings ?? openSettingsByHash}
      />
    );
  }

  return (
    <div className="brutal vocabulary-page">
      <header className="brutal__head">
        <div className="brutal__title">
          <span className="brutal__title-mark">
            <DoodleIcon name="sync" size={28} />
          </span>
          <div>
            <h1>Review</h1>
            <p className="b-eyebrow">
              {stats.dueNow} due · {stats.new} new · goal {snapshot.settings.dailyReviewGoal}
            </p>
          </div>
        </div>

        <div className="brutal__head-actions">
          <div className="b-switch" role="tablist" aria-label="Vocabulary view">
            <button
              type="button"
              role="tab"
              aria-selected={false}
              data-active={false}
              onClick={() => {
                if (onOpenLibrary) {
                  onOpenLibrary();
                  return;
                }
                setView("library");
              }}
            >
              Library {stats.totalWords}
            </button>
            <button type="button" role="tab" aria-selected data-active="true">
              Review {stats.dueNow + stats.new}
            </button>
          </div>
        </div>
      </header>

      <ReviewWorkspace snapshot={snapshot} onNotice={onNotice} />
    </div>
  );
}

function ReviewWorkspace({
  snapshot,
  onNotice,
}: {
  snapshot: ReturnType<typeof vocabularyRepository.getSnapshot>;
  onNotice: (message: string) => void;
}): React.JSX.Element {
  const [sessionWordIds] = useState(() => {
    const now = Date.now();
    return [...vocabularyRepository.getEnabledWords(snapshot)]
      .sort((left, right) => {
        const leftDue = Date.parse(snapshot.progress[left.word.id]?.dueAt ?? "0001-01-01");
        const rightDue = Date.parse(snapshot.progress[right.word.id]?.dueAt ?? "0001-01-01");
        const leftPriority = leftDue <= now ? leftDue : leftDue + 10_000_000_000;
        const rightPriority = rightDue <= now ? rightDue : rightDue + 10_000_000_000;
        return leftPriority - rightPriority;
      })
      .slice(0, snapshot.settings.lastSessionGoal || 20)
      .map((location) => location.word.id);
  });
  const queue = useMemo(() => {
    const byId = new Map(
      vocabularyRepository
        .getEnabledWords(snapshot)
        .map((location) => [location.word.id, location]),
    );
    return sessionWordIds.flatMap((id) => {
      const location = byId.get(id);
      return location ? [location] : [];
    });
  }, [sessionWordIds, snapshot]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startedAt = useRef(Date.now());
  const current = queue[index] ?? null;

  const rate = (action: ReviewAction, label: string) => {
    if (!current) {
      return;
    }
    const responseSeconds = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
    const progress = applyReviewAction(
      snapshot.progress[current.word.id],
      current.word.id,
      action,
      new Date().toISOString(),
      responseSeconds,
    );
    vocabularyRepository.setProgress(
      current.word.id,
      progress,
      createReviewEvent(current, action, responseSeconds),
    );
    if (index + 1 >= queue.length) {
      studyRepository.addActivity(
        "vocabulary",
        "Completed vocabulary review",
        `${queue.length} words reviewed`,
      );
      onNotice(`Review complete: ${queue.length} words.`);
    }
    setIndex((value) => value + 1);
    setRevealed(false);
    startedAt.current = Date.now();
    onNotice(`${current.word.term}: ${label}`);
  };

  if (!current) {
    return (
      <section className="b-frame rev-done">
        <span className="brutal__title-mark" aria-hidden>
          <DoodleIcon name="trophy" size={30} />
        </span>
        <h2>{queue.length ? "Session complete" : "Nothing due"}</h2>
        <p>
          {queue.length
            ? `You reviewed ${queue.length} ${queue.length === 1 ? "word" : "words"}. The next due times are saved on this device.`
            : "Turn on a wordlist or add a personal word to start reviewing."}
        </p>
        {queue.length ? (
          <button
            type="button"
            className="b-btn b-btn--lime"
            onClick={() => window.location.reload()}
          >
            Go again
          </button>
        ) : null}
      </section>
    );
  }

  const seen = Boolean(snapshot.progress[current.word.id]?.timesSeen);
  const percent = Math.round((index / queue.length) * 100);

  return (
    <div className="rev">
      <div className="rev__main">
        <div className="b-frame rev-progress">
          <span className="rev-progress__count">
            {index + 1} / {queue.length}
          </span>
          <span
            className="rev-progress__track"
            role="progressbar"
            aria-label={`${index} of ${queue.length} cards complete`}
            aria-valuemin={0}
            aria-valuemax={queue.length}
            aria-valuenow={index}
          >
            <span className="rev-progress__fill" style={{ width: `${percent}%` }} />
          </span>
          <span className={`b-tag ${seen ? "b-tag--sky" : "b-tag--rose"}`}>
            {seen ? "Review" : "New"}
          </span>
        </div>

        <article className="b-frame rev-card">
          <div className="rev-card__top">
            <div className="rev-card__term">
              <h2>{current.word.term}</h2>
              {current.word.pronunciation ? (
                <p className="rev-card__phonetic">{current.word.pronunciation}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="b-icon-btn"
              onClick={() => speakVocabulary(current.word.term, snapshot.settings)}
              aria-label={`Pronounce ${current.word.term}`}
            >
              <DoodleIcon name="speaker" size={21} />
            </button>
          </div>

          {revealed ? (
            <div className="rev-answer">
              <p className="rev-answer__meaning">
                {current.word.shortMeaning || "No meaning recorded"}
              </p>
              {current.word.exampleSentences[0] ? (
                <p className="rev-answer__example">“{current.word.exampleSentences[0]}”</p>
              ) : null}
              {current.word.collocations?.length ? (
                <ul className="rev-answer__chips">
                  {current.word.collocations.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            /* Recall has to happen before the answer appears, so the hidden
               state is a target you hit rather than a blank space. */
            <button type="button" className="rev-reveal" onClick={() => setRevealed(true)}>
              <DoodleIcon name="bulb" size={30} />
              <strong>Show meaning</strong>
              <small>Say it out loud first, then check.</small>
            </button>
          )}
        </article>

        <div className="rev-ratings">
          <button
            type="button"
            className="b-btn b-btn--flame rev-rating"
            disabled={!revealed}
            onClick={() => rate("skipped", "Again")}
          >
            <strong>Again</strong>
            <small>under 5 min</small>
          </button>
          <button
            type="button"
            className="b-btn b-btn--rose rev-rating"
            disabled={!revealed}
            onClick={() => rate("later", "Hard")}
          >
            <strong>Hard</strong>
            <small>10 min</small>
          </button>
          <button
            type="button"
            className="b-btn b-btn--sky rev-rating"
            disabled={!revealed}
            onClick={() => rate("known", "Good")}
          >
            <strong>Good</strong>
            <small>1+ day</small>
          </button>
          <button
            type="button"
            className="b-btn b-btn--mint rev-rating"
            disabled={!revealed}
            onClick={() => rate("known", "Easy")}
          >
            <strong>Easy</strong>
            <small>2+ days</small>
          </button>
        </div>
      </div>

      <aside className="rev__side">
        <section className="b-frame rev-stat">
          <h3>Session</h3>
          <div
            className="rev-dial"
            style={{ "--dial": `${percent * 3.6}deg` } as React.CSSProperties}
            aria-hidden
          >
            <span>{percent}%</span>
          </div>
          <dl className="rev-tally">
            <div>
              <dt>Done</dt>
              <dd>{index}</dd>
            </div>
            <div>
              <dt>Left</dt>
              <dd>{queue.length - index}</dd>
            </div>
          </dl>
        </section>

        <section className="b-frame b-frame--sun rev-reminder">
          <h3>
            <DoodleIcon name="bell" size={18} />
            Reminders
          </h3>
          <p>
            Every {snapshot.settings.reminderIntervalMinutes} min ·{" "}
            {snapshot.settings.notificationMode === "off" ? "paused" : "active"}
          </p>
          <button
            type="button"
            className="b-btn b-btn--block"
            onClick={() => {
              vocabularyRepository.pauseReminders(60);
              onNotice("Vocabulary reminders paused for one hour.");
            }}
          >
            Pause 1 hour
          </button>
        </section>
      </aside>
    </div>
  );
}
