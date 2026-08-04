import { BookOpenTextIcon } from "@phosphor-icons/react/BookOpenText";
import { BooksIcon } from "@phosphor-icons/react/Books";
import { BrainIcon } from "@phosphor-icons/react/Brain";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { EyeIcon } from "@phosphor-icons/react/Eye";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { PauseIcon } from "@phosphor-icons/react/Pause";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { SpeakerHighIcon } from "@phosphor-icons/react/SpeakerHigh";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XIcon } from "@phosphor-icons/react/X";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyReviewAction,
  calculateVocabularyStats,
  createSessionPlan,
  filterWordListsForSession,
  getMistakeCandidates,
} from "../features/vocabulary/vocabularyEngine";
import { useVocabularySnapshot } from "../hooks/useVocabularySnapshot";
import { formatCount, formatPercentage } from "../lib/format";
import { isEditableTarget } from "../lib/keyboard";
import {
  createReviewEvent,
  vocabularyRepository,
  type VocabularySnapshot,
  type WordLocation,
} from "../services/vocabularyRepository";
import { playVocabularyCue, speakVocabulary } from "../services/vocabularyBrowser";
import type { MistakeCandidate, ReviewAction, ReviewSessionOptions } from "../types/vocabulary";
import { VocabularyLibrary } from "./VocabularyLibrary";

type VocabularySection = "overview" | "review" | "library" | "mistakes" | "activity";

interface VocabularyWorkspaceProps {
  onOpenSettings: () => void;
  onNotice: (message: string) => void;
}

interface SessionResult {
  wordId: string;
  term: string;
  action: ReviewAction;
}

interface ActiveSession {
  options: ReviewSessionOptions;
  queue: WordLocation[];
  index: number;
  revealed: boolean;
  startedAt: number;
  wordStartedAt: number;
  pausedAt: number | null;
  pausedDurationMs: number;
  results: SessionResult[];
  completed: boolean;
}

const SECTION_META = {
  overview: {
    label: "Overview",
    Icon: BrainIcon,
  },
  review: {
    label: "Review",
    Icon: BookOpenTextIcon,
  },
  library: {
    label: "Library",
    Icon: BooksIcon,
  },
  mistakes: {
    label: "Mistake Lab",
    Icon: WarningCircleIcon,
  },
  activity: {
    label: "Activity",
    Icon: ChartLineUpIcon,
  },
} as const;

const SECTIONS = Object.keys(SECTION_META) as VocabularySection[];

function getSectionTabId(section: VocabularySection): string {
  return `vocabulary-tab-${section}`;
}

function getSectionPanelId(section: VocabularySection): string {
  return `vocabulary-panel-${section}`;
}

function isInteractiveReviewTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? isEditableTarget(target) ||
        Boolean(
          target.closest(
            "a[href], audio, video, button, summary, [role='button'], [role='link'], [role='menuitem'], [role='option'], [role='switch'], [role='tab'], [role='checkbox'], [role='radio'], [role='slider']",
          ),
        )
    : false;
}

function getVocabularySection(): VocabularySection {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const section = params.get("section");
  return SECTIONS.includes(section as VocabularySection)
    ? (section as VocabularySection)
    : "overview";
}

function getInitialWordId(): string | undefined {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("word") ?? undefined;
}

function routeToSection(section: VocabularySection): void {
  const params = new URLSearchParams({ view: "vocabulary", section });
  window.history.pushState(null, "", `#${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatShortDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return "Not yet";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildSessionQueue(
  snapshot: VocabularySnapshot,
  options: ReviewSessionOptions,
): WordLocation[] {
  const eligibleLists = filterWordListsForSession(
    snapshot.wordLists.filter((list) => list.isEnabled),
    snapshot.progress,
    options,
  );
  const locations = eligibleLists.flatMap((list) => list.words.map((word) => ({ word, list })));
  const unique = [...new Map(locations.map((location) => [location.word.id, location])).values()];

  if (snapshot.settings.selectionMode === "random") {
    for (let index = unique.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [unique[index], unique[randomIndex]] = [unique[randomIndex], unique[index]];
    }
  } else {
    unique.sort((left, right) => {
      const leftProgress = snapshot.progress[left.word.id];
      const rightProgress = snapshot.progress[right.word.id];
      const leftDue = leftProgress ? Date.parse(leftProgress.dueAt) : Number.NEGATIVE_INFINITY;
      const rightDue = rightProgress ? Date.parse(rightProgress.dueAt) : Number.NEGATIVE_INFINITY;
      return (
        leftDue - rightDue ||
        (rightProgress?.lapses ?? 0) - (leftProgress?.lapses ?? 0) ||
        (rightProgress?.memoryDifficulty ?? 5) - (leftProgress?.memoryDifficulty ?? 5) ||
        (leftProgress?.timesSeen ?? 0) - (rightProgress?.timesSeen ?? 0)
      );
    });
  }

  return unique.slice(0, Math.max(1, options.goal));
}

function urgencyRank(candidate: MistakeCandidate): number {
  return candidate.urgency === "high" ? 3 : candidate.urgency === "medium" ? 2 : 1;
}

export function VocabularyWorkspace({
  onOpenSettings,
  onNotice,
}: VocabularyWorkspaceProps): React.JSX.Element {
  const snapshot = useVocabularySnapshot();
  const [section, setSection] = useState<VocabularySection>(getVocabularySection);
  const [initialWordId, setInitialWordId] = useState(getInitialWordId);
  const [sessionGoal, setSessionGoal] = useState(snapshot.settings.lastSessionGoal);
  const [sessionListId, setSessionListId] = useState(snapshot.settings.lastSessionWordListId ?? "");
  const [difficultOnly, setDifficultOnly] = useState(snapshot.settings.lastSessionDifficultOnly);
  const [timed, setTimed] = useState(snapshot.settings.lastSessionTimed);
  const [focusMode, setFocusMode] = useState(snapshot.settings.lastSessionFocusMode);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [timedSeconds, setTimedSeconds] = useState(15);
  const [mistakeQuery, setMistakeQuery] = useState("");
  const [mistakeUrgency, setMistakeUrgency] = useState("all");
  const [activityDays, setActivityDays] = useState(30);
  const actionLockRef = useRef(false);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const reviewSetupHeadingRef = useRef<HTMLHeadingElement>(null);
  const reviewWordHeadingRef = useRef<HTMLHeadingElement>(null);
  const reviewCompleteHeadingRef = useRef<HTMLHeadingElement>(null);

  const nowIso = new Date().toISOString();
  const stats = useMemo(
    () =>
      calculateVocabularyStats(
        snapshot.wordLists,
        snapshot.progress,
        snapshot.events,
        nowIso,
        snapshot.settings.dailyReviewGoal,
      ),
    [nowIso, snapshot],
  );
  const mistakes = useMemo(
    () =>
      getMistakeCandidates(snapshot.wordLists, snapshot.progress, 500).sort(
        (left, right) =>
          urgencyRank(right) - urgencyRank(left) ||
          right.misses - left.misses ||
          left.word.term.localeCompare(right.word.term),
      ),
    [snapshot.progress, snapshot.wordLists],
  );

  const recommendedPlan = useMemo(
    () =>
      createSessionPlan(
        snapshot.wordLists,
        snapshot.progress,
        nowIso,
        snapshot.settings.defaultSessionSize,
      ),
    [nowIso, snapshot],
  );
  const configuredPlan = useMemo(
    () =>
      createSessionPlan(
        snapshot.wordLists,
        snapshot.progress,
        nowIso,
        sessionGoal,
        sessionListId || null,
        difficultOnly,
      ),
    [difficultOnly, nowIso, sessionGoal, sessionListId, snapshot.progress, snapshot.wordLists],
  );

  const selectSection = useCallback(
    (nextSection: VocabularySection, focusTarget: "main" | "tab" = "main") => {
      setSection(nextSection);
      setInitialWordId(undefined);
      routeToSection(nextSection);
      window.requestAnimationFrame(() => {
        if (focusTarget === "tab") {
          document
            .querySelector<HTMLElement>(`[data-vocabulary-section="${nextSection}"]`)
            ?.focus({ preventScroll: true });
        } else {
          document.getElementById("main-content")?.focus({ preventScroll: true });
        }
      });
    },
    [],
  );

  useEffect(() => {
    const sync = () => {
      setSection(getVocabularySection());
      setInitialWordId(getInitialWordId());
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  const startSession = useCallback(
    (options: ReviewSessionOptions) => {
      const current = vocabularyRepository.getSnapshot();
      const queue = buildSessionQueue(current, options);
      if (!queue.length) {
        onNotice("No words match this review session.");
        return;
      }
      try {
        vocabularyRepository.saveSessionPreferences({
          lastSessionGoal: options.goal,
          lastSessionWordListId: options.wordListId,
          lastSessionDifficultOnly: options.difficultOnly,
          lastSessionTimed: options.timed,
          lastSessionFocusMode: options.focusMode,
        });
      } catch {
        onNotice("The review can start, but its session settings could not be saved.");
      }
      const startedAt = Date.now();
      setSession({
        options,
        queue,
        index: 0,
        revealed: false,
        startedAt,
        wordStartedAt: startedAt,
        pausedAt: null,
        pausedDurationMs: 0,
        results: [],
        completed: false,
      });
      setTimedSeconds(15);
      setSection("review");
      routeToSection("review");
    },
    [onNotice],
  );

  const submitReview = useCallback(
    (action: ReviewAction) => {
      if (actionLockRef.current || !session || session.completed || session.pausedAt) {
        return;
      }
      const location = session.queue[session.index];
      if (!location || ((action === "known" || action === "later") && !session.revealed)) {
        return;
      }
      actionLockRef.current = true;
      const responseSeconds = Math.max(0, (Date.now() - session.wordStartedAt) / 1000);
      const current = vocabularyRepository.getSnapshot();
      const progress = applyReviewAction(
        current.progress[location.word.id],
        location.word.id,
        action,
        new Date().toISOString(),
        responseSeconds,
      );
      try {
        vocabularyRepository.setProgress(
          location.word.id,
          progress,
          createReviewEvent(location, action, responseSeconds),
        );
      } catch {
        actionLockRef.current = false;
        onNotice("This answer could not be saved. Your review remains on the current word.");
        return;
      }
      playVocabularyCue(current.settings.soundEnabled, action === "known" ? "known" : "later");

      const nextIndex = session.index + 1;
      const completed = nextIndex >= session.queue.length;
      setSession((currentSession) =>
        currentSession
          ? {
              ...currentSession,
              index: nextIndex,
              revealed: false,
              wordStartedAt: Date.now(),
              results: [
                ...currentSession.results,
                {
                  wordId: location.word.id,
                  term: location.word.term,
                  action,
                },
              ],
              completed,
            }
          : null,
      );
      setTimedSeconds(15);
      if (completed) {
        playVocabularyCue(current.settings.soundEnabled, "complete");
        onNotice(`Review complete. ${formatCount(session.results.length + 1, "word")} reviewed.`);
      }
      window.setTimeout(() => {
        actionLockRef.current = false;
      }, 400);
    },
    [onNotice, session],
  );

  const togglePause = useCallback(() => {
    setSession((current) => {
      if (!current || current.completed) {
        return current;
      }
      const now = Date.now();
      if (current.pausedAt) {
        const pausedFor = now - current.pausedAt;
        return {
          ...current,
          pausedAt: null,
          pausedDurationMs: current.pausedDurationMs + pausedFor,
          wordStartedAt: current.wordStartedAt + pausedFor,
        };
      }
      return { ...current, pausedAt: now };
    });
  }, []);

  useEffect(() => {
    if (!session || session.completed || !session.options.timed || session.pausedAt) {
      return;
    }
    const update = () => {
      const remaining = Math.max(0, 15 - Math.floor((Date.now() - session.wordStartedAt) / 1000));
      setTimedSeconds(remaining);
      if (remaining === 0) {
        submitReview("skipped");
      }
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [session, submitReview]);

  useEffect(() => {
    if (!session || session.completed || section !== "review") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        isInteractiveReviewTarget(event.target) ||
        document.querySelector("[role='dialog']") ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        setSession((current) =>
          current && !current.pausedAt ? { ...current, revealed: true } : current,
        );
      } else if (event.key === "1") {
        event.preventDefault();
        submitReview("known");
      } else if (event.key === "2") {
        event.preventDefault();
        submitReview("later");
      } else if (event.key === "3") {
        event.preventDefault();
        submitReview("skipped");
      } else if (event.key === "Escape") {
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [section, session, submitReview, togglePause]);

  const filteredMistakes = mistakes.filter((candidate) => {
    const query = mistakeQuery.trim().toLocaleLowerCase();
    return (
      (mistakeUrgency === "all" || candidate.urgency === mistakeUrgency) &&
      (!query ||
        candidate.word.term.toLocaleLowerCase().includes(query) ||
        candidate.word.shortMeaning?.toLocaleLowerCase().includes(query) ||
        candidate.reason.toLocaleLowerCase().includes(query))
    );
  });

  const recentEvents = [...snapshot.events]
    .reverse()
    .filter(
      (event) => Date.parse(event.timestamp) >= Date.now() - activityDays * 24 * 60 * 60 * 1000,
    );

  const activityBuckets = useMemo(() => {
    const bucketCount = activityDays === 7 ? 7 : activityDays === 30 ? 10 : 12;
    const bucketDays = activityDays / bucketCount;
    return Array.from({ length: bucketCount }, (_, index) => {
      const newestOffset = activityDays - (index + 1) * bucketDays;
      const oldestOffset = activityDays - index * bucketDays;
      const start = nowIso ? Date.now() - oldestOffset * 24 * 60 * 60 * 1000 : 0;
      const end = Date.now() - newestOffset * 24 * 60 * 60 * 1000;
      const events = recentEvents.filter((event) => {
        const timestamp = Date.parse(event.timestamp);
        return timestamp >= start && timestamp < end;
      });
      return {
        label:
          activityDays === 7
            ? new Date(end - 1).toLocaleDateString(undefined, {
                weekday: "short",
              })
            : new Date(end - 1).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              }),
        total: events.length,
        known: events.filter((event) => event.action === "known").length,
        later: events.filter((event) => event.action === "later").length,
        skipped: events.filter((event) => event.action === "skipped").length,
      };
    });
  }, [activityDays, nowIso, recentEvents]);

  const maxActivityBucket = Math.max(1, ...activityBuckets.map((bucket) => bucket.total));
  const recentKnownWords = new Set(
    recentEvents.filter((event) => event.action === "known").map((event) => event.wordId),
  ).size;

  const currentWord = session && !session.completed ? session.queue[session.index] : null;
  const knownCount = session?.results.filter((result) => result.action === "known").length ?? 0;
  const laterCount = session?.results.filter((result) => result.action === "later").length ?? 0;
  const skippedCount = session?.results.filter((result) => result.action === "skipped").length ?? 0;
  const recallRate = session?.results.length
    ? Math.round((knownCount / session.results.length) * 100)
    : 0;
  const reviewState = !session ? "setup" : session.completed ? "complete" : "active";

  useEffect(() => {
    if (section !== "review") {
      return;
    }
    if (reviewState === "active" && !currentWord?.word.id) {
      return;
    }
    const heading =
      reviewState === "setup"
        ? reviewSetupHeadingRef.current
        : reviewState === "complete"
          ? reviewCompleteHeadingRef.current
          : reviewWordHeadingRef.current;
    const frame = window.requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [currentWord?.word.id, reviewState, section]);

  return (
    <main
      className={`workspace-main workspace-main--wide vocabulary-workspace${
        session?.options.focusMode && !session.completed ? " vocabulary-workspace--focus" : ""
      }${section === "library" ? " vocabulary-workspace--library" : ""}`}
      id="main-content"
      tabIndex={-1}
    >
      <header className="vocabulary-workspace-header">
        <div>
          <p className="vocabulary-workspace-eyebrow">Vocabulary trainer</p>
          <h1>Remember words by using them often.</h1>
        </div>
        {section !== "library" ? (
          <button type="button" className="vocabulary-header-settings" onClick={onOpenSettings}>
            <GearSixIcon size={19} aria-hidden />
            Reminder settings
          </button>
        ) : null}
      </header>

      <div className="vocabulary-tabs" aria-label="Vocabulary" role="tablist">
        {SECTIONS.map((item) => {
          const { Icon, label } = SECTION_META[item];
          const active = section === item;
          return (
            <button
              type="button"
              key={item}
              className="vocabulary-tab"
              data-vocabulary-section={item}
              data-active={active}
              role="tab"
              id={getSectionTabId(item)}
              aria-controls={getSectionPanelId(item)}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => selectSection(item)}
              onKeyDown={(event) => {
                const currentIndex = SECTIONS.indexOf(item);
                const nextIndex =
                  event.key === "ArrowRight"
                    ? (currentIndex + 1) % SECTIONS.length
                    : event.key === "ArrowLeft"
                      ? (currentIndex - 1 + SECTIONS.length) % SECTIONS.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? SECTIONS.length - 1
                          : -1;
                if (nextIndex >= 0) {
                  event.preventDefault();
                  selectSection(SECTIONS[nextIndex], "tab");
                }
              }}
            >
              <Icon size={19} weight={active ? "duotone" : "regular"} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {section === "overview" ? (
        <div
          className="vocabulary-overview"
          id={getSectionPanelId("overview")}
          role="tabpanel"
          aria-labelledby={getSectionTabId("overview")}
        >
          <section className="vocabulary-today-panel" aria-labelledby="vocab-today">
            <div className="vocabulary-today-copy">
              <span className="vocabulary-status-dot" aria-hidden />
              <p>Today</p>
              <h2 id="vocab-today">
                {stats.dueNow > 0
                  ? `${formatCount(stats.dueNow, "review")} due now`
                  : stats.new > 0
                    ? `${formatCount(stats.new, "new word")} available`
                    : "Your queue is clear"}
              </h2>
              <span>
                {formatCount(stats.reviewedToday, "review")} of {stats.dailyReviewGoal} completed
                today
              </span>
            </div>
            <div
              className="vocabulary-daily-progress"
              style={{ "--vocab-progress": `${stats.dailyGoalProgress}%` } as React.CSSProperties}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(stats.dailyGoalProgress)}
              aria-label={`${Math.round(stats.dailyGoalProgress)} percent of daily goal`}
            >
              <strong>{Math.round(stats.dailyGoalProgress)}%</strong>
              <span>daily goal</span>
            </div>
            <button
              type="button"
              className="vocabulary-primary-action"
              disabled={!recommendedPlan.hasEligibleWords}
              onClick={() =>
                startSession({
                  ...recommendedPlan.options,
                  timed: snapshot.settings.lastSessionTimed,
                  focusMode: true,
                })
              }
            >
              <PlayIcon size={20} weight="fill" aria-hidden />
              Start{" "}
              {recommendedPlan.options.goal
                ? formatCount(recommendedPlan.options.goal, "word")
                : "review"}
            </button>
          </section>

          <section className="vocabulary-metrics" aria-label="Vocabulary status">
            <article>
              <span>Recall</span>
              <strong>{formatPercentage(stats.recallRate, stats.totalReviews > 0)}</strong>
              <small>
                {stats.totalReviews
                  ? `${formatCount(stats.totalReviews, "review")} recorded`
                  : "Not enough data"}
              </small>
            </article>
            <article>
              <span>Needs attention</span>
              <strong>{mistakes.length}</strong>
              <small>{formatCount(stats.difficultWords, "intensive-practice word")}</small>
            </article>
            <article>
              <span>Library</span>
              <strong>{stats.totalWords}</strong>
              <small>
                {formatCount(
                  snapshot.wordLists.filter((list) => list.isEnabled).length,
                  "active list",
                )}
              </small>
            </article>
            <article>
              <span>Consistency</span>
              <strong>{stats.totalReviews ? stats.reviewStreakDays : "—"}</strong>
              <small>
                {stats.totalReviews
                  ? `${formatCount(stats.reviewStreakDays, "day")} review streak`
                  : "Start a review to begin"}
              </small>
            </article>
          </section>

          <div className="vocabulary-overview-grid">
            <section className="vocabulary-panel" aria-labelledby="mastery-title">
              <div className="vocabulary-panel-heading">
                <div>
                  <p>Memory stages</p>
                  <h2 id="mastery-title">Mastery map</h2>
                </div>
                <button type="button" onClick={() => selectSection("activity")}>
                  View activity
                </button>
              </div>
              {(
                [
                  ["New", stats.new],
                  ["Learning", stats.learning],
                  ["Familiar", stats.familiar],
                  ["Mastered", stats.mastered],
                ] as const
              ).map(([label, value]) => (
                <div className="vocabulary-mastery-row" key={label}>
                  <span>{label}</span>
                  <div>
                    <i
                      style={{
                        width: `${stats.totalWords ? (value / stats.totalWords) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>

            <section className="vocabulary-panel" aria-labelledby="reminder-title">
              <div className="vocabulary-panel-heading">
                <div>
                  <p>Reminder status</p>
                  <h2 id="reminder-title">
                    {snapshot.settings.notificationMode === "off"
                      ? "Reminders are off"
                      : snapshot.pausedUntil && Date.parse(snapshot.pausedUntil) > Date.now()
                        ? "Reminders are paused"
                        : `Every ${formatCount(
                            snapshot.settings.reminderIntervalMinutes,
                            "minute",
                          )}`}
                  </h2>
                </div>
              </div>
              <dl className="vocabulary-reminder-summary">
                <div>
                  <dt>Next reminder</dt>
                  <dd>{formatShortDate(snapshot.nextReminderAt)}</dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>
                    {snapshot.settings.notificationMode === "system"
                      ? "System notification"
                      : snapshot.settings.notificationMode}
                  </dd>
                </div>
                <div>
                  <dt>Quiet hours</dt>
                  <dd>
                    {snapshot.settings.quietHoursEnabled
                      ? `${snapshot.settings.quietHoursStart}–${snapshot.settings.quietHoursEnd}`
                      : "Off"}
                  </dd>
                </div>
              </dl>
              <div className="vocabulary-pause-actions">
                {[15, 30, 60].map((minutes) => (
                  <button
                    type="button"
                    key={minutes}
                    onClick={() => {
                      try {
                        vocabularyRepository.pauseReminders(minutes);
                        onNotice(`Reminders paused for ${formatCount(minutes, "minute")}.`);
                      } catch {
                        onNotice("The reminder schedule could not be updated on this device.");
                      }
                    }}
                  >
                    Pause {minutes}m
                  </button>
                ))}
                {snapshot.pausedUntil && Date.parse(snapshot.pausedUntil) > Date.now() ? (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        vocabularyRepository.pauseReminders(null);
                        onNotice("Reminders resumed.");
                      } catch {
                        onNotice("The reminder schedule could not be updated on this device.");
                      }
                    }}
                  >
                    Resume
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {section === "review" ? (
        <div
          className="vocabulary-review"
          id={getSectionPanelId("review")}
          role="tabpanel"
          aria-labelledby={getSectionTabId("review")}
        >
          {!session ? (
            <div className="vocabulary-review-setup">
              <section className="vocabulary-recommended-session">
                <div>
                  <p>Recommended now</p>
                  <h2 ref={reviewSetupHeadingRef} tabIndex={-1}>
                    {recommendedPlan.hasEligibleWords
                      ? `${formatCount(recommendedPlan.options.goal, "word")} · about ${formatCount(
                          recommendedPlan.estimatedMinutes,
                          "minute",
                        )}`
                      : "No words available"}
                  </h2>
                  <span>{recommendedPlan.reason}</span>
                </div>
                <dl>
                  <div>
                    <dt>Due</dt>
                    <dd>{recommendedPlan.dueCount}</dd>
                  </div>
                  <div>
                    <dt>New</dt>
                    <dd>{recommendedPlan.newCount}</dd>
                  </div>
                  <div>
                    <dt>Difficult</dt>
                    <dd>{recommendedPlan.difficultCount}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="vocabulary-primary-action"
                  disabled={!recommendedPlan.hasEligibleWords}
                  onClick={() =>
                    startSession({
                      ...recommendedPlan.options,
                      timed,
                      focusMode,
                    })
                  }
                >
                  <PlayIcon size={20} weight="fill" aria-hidden />
                  Start recommended
                </button>
              </section>

              <section className="vocabulary-session-builder">
                <div className="vocabulary-panel-heading">
                  <div>
                    <p>Custom session</p>
                    <h2>Choose the right amount of challenge.</h2>
                  </div>
                </div>
                <div className="vocabulary-session-form">
                  <div className="vocabulary-session-size-control">
                    <label>
                      <span>Session size</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={sessionGoal}
                        onChange={(event) =>
                          setSessionGoal(
                            Math.min(100, Math.max(1, Number(event.currentTarget.value) || 1)),
                          )
                        }
                      />
                    </label>
                    <fieldset className="vocabulary-goal-presets">
                      <legend className="sr-only">Session-size presets</legend>
                      {[10, 20, 30].map((goal) => (
                        <button
                          type="button"
                          key={goal}
                          data-active={sessionGoal === goal}
                          aria-pressed={sessionGoal === goal}
                          onClick={() => setSessionGoal(goal)}
                        >
                          {goal}
                        </button>
                      ))}
                    </fieldset>
                  </div>
                  <label>
                    <span>Wordlist</span>
                    <select
                      value={sessionListId}
                      onChange={(event) => setSessionListId(event.target.value)}
                    >
                      <option value="">All enabled wordlists</option>
                      {snapshot.wordLists
                        .filter((list) => list.isEnabled)
                        .map((list) => (
                          <option value={list.id} key={list.id}>
                            {list.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="vocabulary-check-row">
                    <input
                      type="checkbox"
                      checked={difficultOnly}
                      onChange={(event) => setDifficultOnly(event.target.checked)}
                    />
                    <span>
                      <strong>Intensive practice only</strong>
                      <small>Words with repeated misses or high difficulty.</small>
                    </span>
                  </label>
                  <label className="vocabulary-check-row">
                    <input
                      type="checkbox"
                      checked={timed}
                      onChange={(event) => setTimed(event.target.checked)}
                    />
                    <span>
                      <strong>15-second recall timer</strong>
                      <small>Unanswered words are skipped when time runs out.</small>
                    </span>
                  </label>
                  <label className="vocabulary-check-row">
                    <input
                      type="checkbox"
                      checked={focusMode}
                      onChange={(event) => setFocusMode(event.target.checked)}
                    />
                    <span>
                      <strong>Focus mode</strong>
                      <small>Reduce navigation while the session is active.</small>
                    </span>
                  </label>
                </div>
                <footer className="vocabulary-session-footer">
                  <span>
                    {configuredPlan.hasEligibleWords
                      ? `${formatCount(configuredPlan.options.goal, "word")} · ${formatCount(
                          configuredPlan.dueCount,
                          "due review",
                        )} · about ${formatCount(configuredPlan.estimatedMinutes, "minute")}`
                      : configuredPlan.reason}
                  </span>
                  <button
                    type="button"
                    className="vocabulary-primary-action"
                    disabled={!configuredPlan.hasEligibleWords}
                    onClick={() =>
                      startSession({
                        ...configuredPlan.options,
                        timed,
                        focusMode,
                      })
                    }
                  >
                    Start session
                  </button>
                </footer>
              </section>
            </div>
          ) : session.completed ? (
            <section className="vocabulary-session-complete" aria-live="polite">
              <span className="vocabulary-complete-icon">
                <CheckIcon size={28} weight="bold" aria-hidden />
              </span>
              <p>Session complete</p>
              <h2 ref={reviewCompleteHeadingRef} tabIndex={-1}>
                You reviewed {formatCount(session.results.length, "word")}.
              </h2>
              <span>
                {formatCount(
                  Math.max(
                    1,
                    Math.round(
                      (Date.now() - session.startedAt - session.pausedDurationMs) / 60_000,
                    ),
                  ),
                  "minute",
                )}{" "}
                of focused practice
              </span>
              <div className="vocabulary-complete-metrics">
                <div>
                  <strong>{knownCount}</strong>
                  <span>Known</span>
                </div>
                <div>
                  <strong>{laterCount}</strong>
                  <span>Later</span>
                </div>
                <div>
                  <strong>{skippedCount}</strong>
                  <span>Skipped</span>
                </div>
                <div>
                  <strong>{recallRate}%</strong>
                  <span>Recall</span>
                </div>
              </div>
              <div className="vocabulary-complete-actions">
                {laterCount + skippedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const missed = session.results
                        .filter((result) => result.action !== "known")
                        .map((result) => result.wordId);
                      startSession({
                        goal: missed.length,
                        wordListId: null,
                        difficultOnly: false,
                        timed: session.options.timed,
                        focusMode: true,
                        includedWordIds: [...new Set(missed)],
                      });
                    }}
                  >
                    Review missed
                  </button>
                ) : null}
                <button
                  type="button"
                  className="vocabulary-primary-action"
                  onClick={() => setSession(null)}
                >
                  Another session
                </button>
                <button type="button" onClick={() => selectSection("overview")}>
                  Done
                </button>
              </div>
            </section>
          ) : currentWord ? (
            <section className="vocabulary-recall-shell">
              <header className="vocabulary-recall-progress">
                <span>
                  Word {session.index + 1} of {session.queue.length}
                </span>
                <progress
                  max={session.queue.length}
                  value={session.index}
                  aria-label="Review progress"
                  aria-valuetext={`Reviewing word ${session.index + 1} of ${
                    session.queue.length
                  }; ${formatCount(session.index, "word")} completed`}
                />
                {session.options.timed ? (
                  <strong className={timedSeconds <= 5 ? "is-urgent" : ""}>{timedSeconds}s</strong>
                ) : null}
                <button type="button" onClick={togglePause} ref={pauseButtonRef}>
                  {session.pausedAt ? (
                    <PlayIcon size={18} aria-hidden />
                  ) : (
                    <PauseIcon size={18} aria-hidden />
                  )}
                  {session.pausedAt ? "Resume" : "Pause"}
                </button>
              </header>

              <article className="vocabulary-recall-card">
                <span className="vocabulary-word-source">{currentWord.list.title}</span>
                <div className="vocabulary-word-heading">
                  <div>
                    <h2 ref={reviewWordHeadingRef} tabIndex={-1}>
                      {currentWord.word.term}
                    </h2>
                    <p>
                      {[currentWord.word.partOfSpeech, currentWord.word.pronunciation]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Listen to ${currentWord.word.term}`}
                    onClick={() => speakVocabulary(currentWord.word.term, snapshot.settings)}
                  >
                    <SpeakerHighIcon size={23} aria-hidden />
                  </button>
                </div>

                <div className="vocabulary-recall-meaning" data-revealed={session.revealed}>
                  {session.revealed ? (
                    <>
                      <p dir="auto">{currentWord.word.shortMeaning || "No meaning added."}</p>
                      {currentWord.word.exampleSentences[0] ? (
                        <blockquote dir="auto">{currentWord.word.exampleSentences[0]}</blockquote>
                      ) : null}
                      {currentWord.word.notes ? (
                        <small>Note: {currentWord.word.notes}</small>
                      ) : null}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="vocabulary-reveal-button"
                      onClick={() =>
                        setSession((current) =>
                          current ? { ...current, revealed: true } : current,
                        )
                      }
                    >
                      <EyeIcon size={21} aria-hidden />
                      Reveal meaning
                      <kbd>Space</kbd>
                    </button>
                  )}
                </div>

                <fieldset className="vocabulary-review-actions">
                  <legend className="sr-only">Rate recall</legend>
                  <button
                    type="button"
                    className="is-known"
                    disabled={!session.revealed}
                    onClick={() => submitReview("known")}
                  >
                    <CheckIcon size={19} weight="bold" aria-hidden />
                    Known <kbd>1</kbd>
                  </button>
                  <button
                    type="button"
                    disabled={!session.revealed}
                    onClick={() => submitReview("later")}
                  >
                    <ClockIcon size={19} aria-hidden />
                    Later <kbd>2</kbd>
                  </button>
                  <button type="button" onClick={() => submitReview("skipped")}>
                    <XIcon size={19} aria-hidden />
                    Skip <kbd>3</kbd>
                  </button>
                </fieldset>
              </article>

              <Dialog.Root
                open={Boolean(session.pausedAt)}
                onOpenChange={(open) => {
                  if (!open && session.pausedAt) {
                    togglePause();
                  }
                }}
              >
                <Dialog.Portal>
                  <Dialog.Overlay className="vocabulary-session-pause-overlay" />
                  <Dialog.Content
                    className="vocabulary-session-pause"
                    onCloseAutoFocus={(event) => {
                      event.preventDefault();
                      window.requestAnimationFrame(() => pauseButtonRef.current?.focus());
                    }}
                  >
                    <PauseIcon size={34} aria-hidden />
                    <Dialog.Title>Session paused</Dialog.Title>
                    <Dialog.Description>
                      Your timers are stopped. Resume when you are ready.
                    </Dialog.Description>
                    <Dialog.Close asChild>
                      <button type="button" className="vocabulary-primary-action">
                        Resume session
                      </button>
                    </Dialog.Close>
                    <button type="button" onClick={() => setSession(null)}>
                      End session
                    </button>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </section>
          ) : null}
        </div>
      ) : null}

      {section === "library" ? (
        <div
          className="vocabulary-library-panel"
          id={getSectionPanelId("library")}
          role="tabpanel"
          aria-labelledby={getSectionTabId("library")}
        >
          <VocabularyLibrary
            snapshot={snapshot}
            initialWordId={initialWordId}
            onNotice={onNotice}
            onOpenSettings={onOpenSettings}
          />
        </div>
      ) : null}

      {section === "mistakes" ? (
        <section
          className="vocabulary-mistakes"
          id={getSectionPanelId("mistakes")}
          role="tabpanel"
          aria-labelledby={getSectionTabId("mistakes")}
        >
          <div className="vocabulary-section-heading">
            <div>
              <p>Needs attention</p>
              <h2>Turn misses into durable memory.</h2>
              <span>
                Choosing Later or Skip during review adds the word here. Repeated difficulty
                increases its priority.
              </span>
            </div>
            {filteredMistakes.length ? (
              <button
                type="button"
                className="vocabulary-primary-action"
                onClick={() => {
                  const ids = filteredMistakes.slice(0, 20).map(({ word }) => word.id);
                  startSession({
                    goal: ids.length,
                    wordListId: null,
                    difficultOnly: false,
                    timed: false,
                    focusMode: true,
                    includedWordIds: ids,
                  });
                }}
              >
                Practice {formatCount(Math.min(20, filteredMistakes.length), "word")}
              </button>
            ) : null}
          </div>
          <div className="vocabulary-mistake-tools">
            <label>
              <span className="sr-only">Search difficult words</span>
              <input
                type="search"
                placeholder="Search word, meaning, or reason"
                value={mistakeQuery}
                onChange={(event) => setMistakeQuery(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Urgency</span>
              <select
                value={mistakeUrgency}
                onChange={(event) => setMistakeUrgency(event.target.value)}
              >
                <option value="all">All urgency</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          {filteredMistakes.length ? (
            <div className="vocabulary-mistake-table-wrap">
              <table className="vocabulary-mistake-table">
                <thead>
                  <tr>
                    <th>Word</th>
                    <th>Why it is here</th>
                    <th>Misses</th>
                    <th>Lapses</th>
                    <th>Last review</th>
                    <th>Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMistakes.map((candidate) => (
                    <tr key={candidate.word.id}>
                      <td>
                        <strong>{candidate.word.term}</strong>
                        <span dir="auto">{candidate.word.shortMeaning}</span>
                      </td>
                      <td>{candidate.reason}</td>
                      <td>{candidate.misses}</td>
                      <td>{candidate.lapses}</td>
                      <td>{formatShortDate(candidate.lastReviewedAt)}</td>
                      <td>
                        <span className="vocabulary-urgency" data-urgency={candidate.urgency}>
                          {candidate.urgency}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vocabulary-empty-state vocabulary-empty-state--compact">
              <CheckIcon size={28} aria-hidden />
              <h3>
                {mistakes.length ? "No words match these filters" : "No words need attention"}
              </h3>
              <p>
                {mistakes.length
                  ? "Clear the search or choose All urgency to see the full list."
                  : "Choose Later or Skip during a review and the word will appear here."}
              </p>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => {
                  if (mistakes.length) {
                    setMistakeQuery("");
                    setMistakeUrgency("all");
                  } else {
                    selectSection("review");
                  }
                }}
              >
                {mistakes.length ? "Clear filters" : "Go to Review"}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {section === "activity" ? (
        <section
          className="vocabulary-activity"
          id={getSectionPanelId("activity")}
          role="tabpanel"
          aria-labelledby={getSectionTabId("activity")}
        >
          <div className="vocabulary-section-heading">
            <div>
              <p>Learning activity</p>
              <h2>See the pattern behind your recall.</h2>
              <span>Reviews and learning progress are stored on this device.</span>
            </div>
            <fieldset className="vocabulary-range-switch">
              <legend className="sr-only">Activity range</legend>
              {[7, 30, 90].map((days) => (
                <button
                  type="button"
                  data-active={activityDays === days}
                  aria-pressed={activityDays === days}
                  key={days}
                  onClick={() => setActivityDays(days)}
                >
                  {days}d
                </button>
              ))}
            </fieldset>
          </div>
          <div className="vocabulary-activity-metrics">
            <article>
              <span>Reviews</span>
              <strong>{recentEvents.length}</strong>
            </article>
            <article>
              <span>Known</span>
              <strong>{recentEvents.filter((event) => event.action === "known").length}</strong>
            </article>
            <article>
              <span>Recall</span>
              <strong>
                {formatPercentage(
                  recentEvents.length
                    ? (recentEvents.filter((event) => event.action === "known").length /
                        recentEvents.length) *
                        100
                    : null,
                  recentEvents.length > 0,
                )}
              </strong>
            </article>
            <article>
              <span>Active days</span>
              <strong>
                {
                  new Set(
                    recentEvents.map((event) => new Date(event.timestamp).toLocaleDateString()),
                  ).size
                }
              </strong>
            </article>
            <article>
              <span>Words recalled</span>
              <strong>{recentEvents.length ? recentKnownWords : "—"}</strong>
            </article>
          </div>
          {recentEvents.length ? (
            <div className="vocabulary-activity-content">
              <section
                className="vocabulary-activity-chart"
                aria-labelledby="vocabulary-activity-chart-title"
              >
                <h3 id="vocabulary-activity-chart-title" className="sr-only">
                  {formatCount(recentEvents.length, "review")} across the last{" "}
                  {formatCount(activityDays, "day")}
                </h3>
                <div className="vocabulary-activity-chart-bars">
                  {activityBuckets.map((bucket) => (
                    <div
                      key={bucket.label}
                      role="img"
                      aria-label={`${bucket.label}: ${formatCount(
                        bucket.total,
                        "review",
                      )}; ${formatCount(bucket.known, "known answer")}; ${formatCount(
                        bucket.later,
                        "Later answer",
                      )}; ${formatCount(bucket.skipped, "skipped answer")}`}
                    >
                      <span
                        style={{
                          height: `${Math.max(5, (bucket.total / maxActivityBucket) * 100)}%`,
                        }}
                        title={`${bucket.label}: ${formatCount(bucket.total, "review")}`}
                      >
                        <i
                          style={{
                            height: `${bucket.total ? (bucket.known / bucket.total) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <small>{bucket.label}</small>
                    </div>
                  ))}
                </div>
                <p>Teal shows known answers; the lighter portion shows Later and Skip responses.</p>
              </section>
              <div className="vocabulary-activity-list">
                {recentEvents.slice(0, 100).map((event) => (
                  <article key={event.id}>
                    <span className="vocabulary-activity-action" data-action={event.action}>
                      {event.action}
                    </span>
                    <div>
                      <strong>{event.term}</strong>
                      <span>
                        {event.responseSeconds
                          ? `${event.responseSeconds.toFixed(1)}s response`
                          : "Reminder review"}
                      </span>
                    </div>
                    <time dateTime={event.timestamp}>{formatShortDate(event.timestamp)}</time>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="vocabulary-empty-state vocabulary-empty-state--compact">
              <ChartLineUpIcon size={28} aria-hidden />
              <h3>No activity in this range</h3>
              <p>Complete a review session to start your activity trend and recall history.</p>
              <button
                type="button"
                className="ui-button ui-button--primary"
                onClick={() => selectSection("review")}
              >
                Start a review
              </button>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
