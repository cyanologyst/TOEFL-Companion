import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { BookmarkSimpleIcon } from "@phosphor-icons/react/BookmarkSimple";
import { BrainIcon } from "@phosphor-icons/react/Brain";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { ChartBarIcon } from "@phosphor-icons/react/ChartBar";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ClockCounterClockwise";
import { FireIcon } from "@phosphor-icons/react/Fire";
import { HouseIcon } from "@phosphor-icons/react/House";
import { KeyboardIcon } from "@phosphor-icons/react/Keyboard";
import { MicrophoneIcon } from "@phosphor-icons/react/Microphone";
import { NotePencilIcon } from "@phosphor-icons/react/NotePencil";
import { QuestionIcon } from "@phosphor-icons/react/Question";
import { TrendUpIcon } from "@phosphor-icons/react/TrendUp";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateVocabularyStats } from "../features/vocabulary/vocabularyEngine";
import { useVocabularySnapshot } from "../hooks/useVocabularySnapshot";
import {
  formatCompactDate,
  formatCount,
  formatDateTime,
  formatDuration,
  formatPercentage,
  pluralize,
} from "../lib/format";
import type { AttemptHistoryItem, RecordingPlayback, Topic, WorkspaceArea } from "../types/toefl";
import { recordingRepository } from "../services/recordingRepository";
import { EmptyState, MetricCard, PageHeader, SurfaceCard } from "./ui";

type WorkspacePage = Exclude<WorkspaceArea, "practice" | "vocabulary" | "settings">;

interface WorkspaceViewProps {
  area: WorkspacePage;
  topics: Topic[];
  savedKeys: Set<string>;
  history: AttemptHistoryItem[];
  onPractice: () => void;
  onVocabulary: () => void;
  onSelectArea: (area: WorkspaceArea) => void;
  onOpenQuestion: (topicId: number, questionIndex: number) => void;
  onUpdateHistory: (history: AttemptHistoryItem[], successMessage?: string) => boolean;
}

interface SavedQuestion {
  key: string;
  topic: Topic;
  question: Topic["questions"][number];
  questionIndex: number;
  lastAttempt: AttemptHistoryItem | null;
}

type SavedSort = "recent" | "topic" | "category";

function questionKey(topicId: number, questionIndex: number): string {
  return `${topicId}-${questionIndex + 1}`;
}

function getSavedQuestions(
  topics: Topic[],
  savedKeys: Set<string>,
  history: AttemptHistoryItem[],
): SavedQuestion[] {
  return topics.flatMap((topic) =>
    topic.questions.flatMap((question, questionIndex) => {
      const key = questionKey(topic.id, questionIndex);
      if (!savedKeys.has(key)) {
        return [];
      }

      const lastAttempt =
        history.find((item) => item.topicId === topic.id && item.questionIndex === questionIndex) ??
        null;

      return [{ key, topic, question, questionIndex, lastAttempt }];
    }),
  );
}

function getPracticeStreak(history: AttemptHistoryItem[]): number {
  const days = new Set(history.map((item) => new Date(item.createdAt).toDateString()));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getPrompt(topics: Topic[], item: AttemptHistoryItem): string {
  return (
    item.promptSnapshot ??
    topics.find((topic) => topic.id === item.topicId)?.questions[item.questionIndex]?.prompt ??
    "This practice prompt is no longer available."
  );
}

function getTopic(topics: Topic[], item: AttemptHistoryItem): Topic | null {
  return topics.find((topic) => topic.id === item.topicId) ?? null;
}

export function WorkspaceView({
  area,
  topics,
  savedKeys,
  history,
  onPractice,
  onVocabulary,
  onSelectArea,
  onOpenQuestion,
  onUpdateHistory,
}: WorkspaceViewProps): React.JSX.Element {
  const vocabulary = useVocabularySnapshot();
  const [savedSort, setSavedSort] = useState<SavedSort>("recent");
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptHistoryItem | null>(null);
  const [attemptNotes, setAttemptNotes] = useState("");
  const [recordingPlayback, setRecordingPlayback] = useState<RecordingPlayback | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [deleteRecordingOpen, setDeleteRecordingOpen] = useState(false);
  const deleteRecordingButtonRef = useRef<HTMLButtonElement>(null);
  const historyDialogCloseButtonRef = useRef<HTMLButtonElement>(null);
  const historyDialogTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let nextPlayback: RecordingPlayback | null = null;
    setRecordingPlayback(null);
    setRecordingError("");

    if (!selectedAttempt?.recordingAvailable || !selectedAttempt.recordingId) {
      setRecordingLoading(false);
      return undefined;
    }

    setRecordingLoading(true);
    void recordingRepository
      .createPlayback(selectedAttempt.recordingId)
      .then((playback) => {
        if (disposed) {
          playback?.release();
          return;
        }
        nextPlayback = playback;
        setRecordingPlayback(playback);
        if (!playback) {
          setRecordingError("The recording is no longer available on this device.");
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setRecordingError(
            error instanceof Error ? error.message : "The saved recording could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!disposed) {
          setRecordingLoading(false);
        }
      });

    return () => {
      disposed = true;
      nextPlayback?.release();
    };
  }, [selectedAttempt?.recordingAvailable, selectedAttempt?.recordingId]);

  const savedQuestions = useMemo(
    () => getSavedQuestions(topics, savedKeys, history),
    [history, savedKeys, topics],
  );
  const sortedSavedQuestions = useMemo(() => {
    const questions = [...savedQuestions];
    if (savedSort === "topic") {
      return questions.sort(
        (left, right) => left.topic.id - right.topic.id || left.questionIndex - right.questionIndex,
      );
    }
    if (savedSort === "category") {
      return questions.sort(
        (left, right) =>
          left.topic.category.localeCompare(right.topic.category) || left.topic.id - right.topic.id,
      );
    }
    return questions.sort((left, right) => {
      const leftTime = left.lastAttempt
        ? Date.parse(left.lastAttempt.createdAt)
        : Number.NEGATIVE_INFINITY;
      const rightTime = right.lastAttempt
        ? Date.parse(right.lastAttempt.createdAt)
        : Number.NEGATIVE_INFINITY;
      return rightTime - leftTime || left.topic.id - right.topic.id;
    });
  }, [savedQuestions, savedSort]);

  const uniqueAttempts = new Set(
    history.map((item) => questionKey(item.topicId, item.questionIndex)),
  ).size;
  const averageSeconds = history.length
    ? history.reduce((total, item) => total + item.durationSeconds, 0) / history.length
    : null;
  const practicedTopicIds = new Set(history.map((item) => item.topicId));
  const practicedCategories = new Set(
    topics.filter((topic) => practicedTopicIds.has(topic.id)).map((topic) => topic.category),
  );
  const allCategories = new Set(topics.map((topic) => topic.category));
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
  const recentAttempts = history.filter((item) => Date.parse(item.createdAt) >= sevenDaysAgo);
  const previousAttempts = history.filter((item) => {
    const timestamp = Date.parse(item.createdAt);
    return timestamp >= fourteenDaysAgo && timestamp < sevenDaysAgo;
  });
  const speakingActivityBuckets = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - offset));
    return {
      key: day.toISOString(),
      label: day.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      count: history.filter(
        (item) => new Date(item.createdAt).toDateString() === day.toDateString(),
      ).length,
    };
  });
  const speakingStreak = getPracticeStreak(history);
  const vocabularyStats = calculateVocabularyStats(
    vocabulary.wordLists,
    vocabulary.progress,
    vocabulary.events,
    new Date().toISOString(),
    vocabulary.settings.dailyReviewGoal,
  );
  const trendDelta = recentAttempts.length - previousAttempts.length;

  const meta: Record<
    WorkspacePage,
    {
      eyebrow: string;
      title: React.ReactNode;
      description: React.ReactNode;
      Icon: typeof HouseIcon;
    }
  > = {
    home: {
      eyebrow: "Your workspace",
      title: "Build recall. Then speak with confidence.",
      description:
        "Move between focused vocabulary review and concise speaking practice without losing your place.",
      Icon: HouseIcon,
    },
    progress: {
      eyebrow: "Learning progress",
      title: "See the practice behind your progress.",
      description: "Speaking and vocabulary stay separate, so every metric has useful context.",
      Icon: ChartBarIcon,
    },
    saved: {
      eyebrow: "Saved questions",
      title: savedQuestions.length
        ? `${formatCount(savedQuestions.length, "question")} saved for later.`
        : "Keep your best practice prompts close.",
      description: "Save prompts from Speaking and return to them for another response.",
      Icon: BookmarkSimpleIcon,
    },
    history: {
      eyebrow: "Speaking history",
      title: history.length
        ? `${formatCount(history.length, "completed response")}.`
        : "Your completed responses will appear here.",
      description:
        "Open an attempt to revisit its prompt, timing, notes, and recording availability.",
      Icon: ClockCounterClockwiseIcon,
    },
    help: {
      eyebrow: "Help & keyboard",
      title: "Move through practice without risky shortcuts.",
      description: "Shortcuts use modifier keys and pause automatically while you type.",
      Icon: QuestionIcon,
    },
  };

  const pageMeta = meta[area];

  function openAttempt(item: AttemptHistoryItem, trigger: HTMLButtonElement): void {
    historyDialogTriggerRef.current = trigger;
    setSelectedAttempt(item);
    setAttemptNotes(item.notes ?? "");
  }

  function saveAttemptNotes(): void {
    if (!selectedAttempt) {
      return;
    }
    const normalized = attemptNotes.trim();
    const next = history.map((item) =>
      item.id === selectedAttempt.id ? { ...item, notes: normalized } : item,
    );
    if (onUpdateHistory(next)) {
      setSelectedAttempt({ ...selectedAttempt, notes: normalized });
    }
  }

  async function deleteSelectedRecording(): Promise<void> {
    if (!selectedAttempt?.recordingId) {
      return;
    }

    setRecordingError("");
    try {
      await recordingRepository.deleteRecording(selectedAttempt.recordingId);
      recordingPlayback?.release();
      setRecordingPlayback(null);

      const updatedAttempt: AttemptHistoryItem = {
        ...selectedAttempt,
        recordingAvailable: false,
        recordingId: undefined,
        mimeType: undefined,
        size: undefined,
      };
      const next = history.map((item) => (item.id === updatedAttempt.id ? updatedAttempt : item));

      if (onUpdateHistory(next, "Recording deleted. The attempt details were kept.")) {
        setSelectedAttempt(updatedAttempt);
      } else {
        setRecordingError(
          "The audio was deleted, but History could not be updated on this device.",
        );
      }
      setDeleteRecordingOpen(false);
    } catch (error: unknown) {
      setDeleteRecordingOpen(false);
      setRecordingError(
        error instanceof Error ? error.message : "The saved recording could not be deleted.",
      );
    }
  }

  return (
    <main className="workspace-main workspace-main--wide" id="main-content" tabIndex={-1}>
      <div className="workspace-view workspace-view--refined">
        <PageHeader
          eyebrow={pageMeta.eyebrow}
          title={pageMeta.title}
          description={pageMeta.description}
          icon={pageMeta.Icon}
        />

        {area === "home" ? (
          <div className="home-action-grid">
            <button
              type="button"
              className="home-action-card home-action-card--primary"
              onClick={onPractice}
            >
              <span className="home-action-card__icon" aria-hidden>
                <MicrophoneIcon size={26} weight="duotone" />
              </span>
              <span className="home-action-card__copy">
                <strong>Speaking practice</strong>
                <small>Choose a question, prepare a response, and record for 45 seconds.</small>
              </span>
              <span className="home-action-card__footer">
                Start a response
                <ArrowRightIcon size={18} aria-hidden />
              </span>
            </button>

            <button
              type="button"
              className="home-action-card home-action-card--vocabulary"
              onClick={onVocabulary}
            >
              <span className="home-action-card__icon" aria-hidden>
                <BrainIcon size={26} weight="duotone" />
              </span>
              <span className="home-action-card__copy">
                <strong>Vocabulary review</strong>
                <small>
                  Review due words, introduce new vocabulary, or practice difficult terms.
                </small>
              </span>
              <span className="home-action-card__footer">
                {vocabularyStats.totalReviews
                  ? `${formatCount(vocabularyStats.dueNow, "review")} due`
                  : `${formatCount(vocabularyStats.new, "new word")} available`}
                <ArrowRightIcon size={18} aria-hidden />
              </span>
            </button>

            <button
              type="button"
              className="home-action-card"
              onClick={() => onSelectArea("saved")}
            >
              <span className="home-action-card__icon" aria-hidden>
                <BookmarkSimpleIcon size={25} weight="duotone" />
              </span>
              <span className="home-action-card__copy">
                <strong>Saved questions</strong>
                <small>Keep useful prompts in a focused queue for another attempt.</small>
              </span>
              <span className="home-action-card__footer">
                {formatCount(savedQuestions.length, "saved question")}
                <ArrowRightIcon size={18} aria-hidden />
              </span>
            </button>

            <button
              type="button"
              className="home-action-card"
              onClick={() => onSelectArea("progress")}
            >
              <span className="home-action-card__icon" aria-hidden>
                <ChartBarIcon size={25} weight="duotone" />
              </span>
              <span className="home-action-card__copy">
                <strong>Learning progress</strong>
                <small>
                  See speaking coverage, recent activity, vocabulary recall, and next steps.
                </small>
              </span>
              <span className="home-action-card__footer">
                {formatCount(uniqueAttempts, "question")} practiced across{" "}
                {formatCount(history.length, "response attempt")}
                <ArrowRightIcon size={18} aria-hidden />
              </span>
            </button>
          </div>
        ) : null}

        {area === "progress" ? (
          <div className="progress-dashboard">
            <section aria-labelledby="speaking-progress-heading">
              <div className="section-heading-row">
                <div>
                  <p>Speaking</p>
                  <h2 id="speaking-progress-heading">Response practice</h2>
                </div>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  onClick={onPractice}
                >
                  Practice speaking
                </button>
              </div>
              <div className="refined-metric-grid">
                <MetricCard
                  label="Completed responses"
                  value={history.length}
                  context={
                    history.length
                      ? formatCount(uniqueAttempts, "unique question")
                      : "Your first response will start this view"
                  }
                  accent="teal"
                />
                <MetricCard
                  label="Question coverage"
                  value={formatPercentage((uniqueAttempts / 120) * 100, history.length > 0)}
                  context={
                    history.length ? `${uniqueAttempts} of 120 questions` : "Not enough data"
                  }
                  accent="blue"
                />
                <MetricCard
                  label="Average response length"
                  value={formatDuration(averageSeconds)}
                  context={
                    history.length === 1
                      ? "Based on 1 response attempt"
                      : history.length
                        ? `Based on ${formatCount(history.length, "attempt")}`
                        : "Not enough data"
                  }
                />
                <MetricCard
                  label="Current streak"
                  value={history.length ? formatCount(speakingStreak, "day") : "—"}
                  context={
                    history.length
                      ? `${practicedCategories.size} of ${allCategories.size} categories explored`
                      : "Practice on consecutive days to build a streak"
                  }
                  accent="amber"
                />
              </div>

              <div className="progress-context-grid">
                <SurfaceCard as="section" className="progress-trend-card">
                  <div className="progress-card-heading">
                    <span aria-hidden>
                      <TrendUpIcon size={20} weight="duotone" />
                    </span>
                    <div>
                      <p>Recent activity</p>
                      <h3>Last 7 days</h3>
                    </div>
                  </div>
                  <strong>{formatCount(recentAttempts.length, "response")}</strong>
                  <p>
                    {previousAttempts.length === 0 && recentAttempts.length === 0
                      ? "Complete a response to begin your activity trend."
                      : trendDelta === 0
                        ? "The same pace as the previous seven days."
                        : `${Math.abs(trendDelta)} ${
                            trendDelta > 0 ? "more" : "fewer"
                          } ${pluralize(Math.abs(trendDelta), "response")} than the previous seven days.`}
                  </p>
                  <div className="progress-mini-bars" aria-hidden>
                    {speakingActivityBuckets.map((bucket) => (
                      <i
                        key={bucket.key}
                        style={{
                          height: `${Math.max(8, Math.min(100, bucket.count * 28))}%`,
                        }}
                        title={`${bucket.label}: ${formatCount(bucket.count, "response")}`}
                      />
                    ))}
                  </div>
                  <ul className="sr-only" aria-label="Responses by day">
                    {speakingActivityBuckets.map((bucket) => (
                      <li key={bucket.key}>
                        {bucket.label}: {formatCount(bucket.count, "response")}
                      </li>
                    ))}
                  </ul>
                </SurfaceCard>

                <SurfaceCard as="section" className="progress-next-card">
                  <div className="progress-card-heading">
                    <span aria-hidden>
                      <FireIcon size={20} weight="duotone" />
                    </span>
                    <div>
                      <p>Recommended next action</p>
                      <h3>
                        {history.length
                          ? "Broaden your speaking coverage"
                          : "Record your first response"}
                      </h3>
                    </div>
                  </div>
                  <p>
                    {history.length
                      ? practicedCategories.size < allCategories.size
                        ? "Choose a question from a category you have not practiced yet."
                        : "Repeat a saved prompt and aim for a clearer 45-second response."
                      : "Choose one familiar topic, use the answer plan, and speak for as long as you can."}
                  </p>
                  <button
                    type="button"
                    className="ui-button ui-button--primary"
                    onClick={onPractice}
                  >
                    Open speaking practice
                    <ArrowRightIcon size={17} aria-hidden />
                  </button>
                </SurfaceCard>
              </div>
            </section>

            <section aria-labelledby="vocabulary-progress-heading">
              <div className="section-heading-row">
                <div>
                  <p>Vocabulary</p>
                  <h2 id="vocabulary-progress-heading">Recall practice</h2>
                </div>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  onClick={onVocabulary}
                >
                  Review vocabulary
                </button>
              </div>
              <div className="refined-metric-grid">
                <MetricCard
                  label="Reviews"
                  value={vocabularyStats.totalReviews}
                  context={formatCount(vocabularyStats.reviewedWords, "word")}
                  accent="teal"
                />
                <MetricCard
                  label="Recall"
                  value={formatPercentage(
                    vocabularyStats.recallRate,
                    vocabularyStats.totalReviews > 0,
                  )}
                  context={
                    vocabularyStats.totalReviews
                      ? `Across ${formatCount(vocabularyStats.totalReviews, "review")}`
                      : "Not enough data"
                  }
                  accent="blue"
                />
                <MetricCard
                  label="Active days"
                  value={vocabularyStats.totalReviews ? vocabularyStats.activeDays : "—"}
                  context={
                    vocabularyStats.totalReviews
                      ? `${formatCount(vocabularyStats.reviewStreakDays, "day")} current streak`
                      : "Start a review to begin tracking"
                  }
                />
                <MetricCard
                  label="Mastered words"
                  value={vocabularyStats.mastered}
                  context={`${vocabularyStats.new} new · ${vocabularyStats.learning} learning · ${vocabularyStats.familiar} familiar`}
                  accent="amber"
                />
              </div>
            </section>
          </div>
        ) : null}

        {area === "saved" ? (
          <section className="saved-workspace" aria-label="Saved questions">
            {savedQuestions.length ? (
              <>
                <div className="content-toolbar">
                  <p>
                    {formatCount(savedQuestions.length, "saved question")} in your practice queue
                  </p>
                  <label>
                    <span>Sort by</span>
                    <select
                      value={savedSort}
                      onChange={(event) => setSavedSort(event.currentTarget.value as SavedSort)}
                    >
                      <option value="recent">Recently practiced</option>
                      <option value="topic">Topic order</option>
                      <option value="category">Category</option>
                    </select>
                  </label>
                </div>
                <div className="saved-question-list">
                  {sortedSavedQuestions.map(
                    ({ key, topic, question, questionIndex, lastAttempt }) => (
                      <article className="saved-question-row" key={key}>
                        <span className="saved-question-row__index">
                          {String(topic.id).padStart(2, "0")} · Q{questionIndex + 1}
                        </span>
                        <div>
                          <p>{topic.category}</p>
                          <strong>{question.prompt}</strong>
                          <small>
                            {lastAttempt
                              ? `Last practiced ${formatCompactDate(lastAttempt.createdAt)}`
                              : "Not practiced yet"}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="ui-button ui-button--secondary"
                          onClick={() => onOpenQuestion(topic.id, questionIndex)}
                        >
                          Open
                          <ArrowRightIcon size={16} aria-hidden />
                        </button>
                      </article>
                    ),
                  )}
                </div>
              </>
            ) : (
              <EmptyState
                icon={BookmarkSimpleIcon}
                title="No saved questions yet"
                description="Open a speaking prompt and choose Save to add it to this queue."
                actionLabel="Browse speaking practice"
                onAction={onPractice}
              />
            )}
          </section>
        ) : null}

        {area === "history" ? (
          <section className="history-workspace" aria-label="Speaking attempts">
            {history.length ? (
              <div className="history-list">
                {history.slice(0, 100).map((item) => {
                  const topic = getTopic(topics, item);
                  return (
                    <button
                      type="button"
                      className="history-row"
                      key={item.id}
                      onClick={(event) => openAttempt(item, event.currentTarget)}
                    >
                      <span
                        className="history-row__status"
                        role="img"
                        title={
                          item.recordingAvailable
                            ? "Recording available on this device"
                            : "Recording not stored"
                        }
                        aria-label={
                          item.recordingAvailable ? "Recording available" : "Recording unavailable"
                        }
                      >
                        {item.recordingAvailable ? (
                          <MicrophoneIcon size={18} weight="duotone" aria-hidden />
                        ) : (
                          <CheckCircleIcon size={18} weight="duotone" aria-hidden />
                        )}
                      </span>
                      <span className="history-row__copy">
                        <small>{formatDateTime(item.createdAt)}</small>
                        <strong>
                          {topic?.title ?? "Speaking practice"} · Question {item.questionIndex + 1}
                        </strong>
                        <span>
                          {formatDuration(item.durationSeconds)}
                          {item.wordCount ? ` · ${formatCount(item.wordCount, "word")}` : ""}
                          {item.notes ? " · Notes added" : ""}
                        </span>
                      </span>
                      <span className="history-row__action">
                        View details
                        <CaretRightIcon size={17} aria-hidden />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={ClockCounterClockwiseIcon}
                title="No completed responses yet"
                description="Save a finished speaking response and its prompt, timing, and notes will appear here."
                actionLabel="Record a response"
                onAction={onPractice}
              />
            )}
          </section>
        ) : null}

        {area === "help" ? (
          <div className="help-workspace">
            <section aria-labelledby="keyboard-shortcuts-heading">
              <div className="section-heading-row">
                <div>
                  <p>Keyboard</p>
                  <h2 id="keyboard-shortcuts-heading">Application shortcuts</h2>
                </div>
              </div>
              <div className="refined-shortcut-grid">
                {[
                  ["Open Search", ["Ctrl", "K"]],
                  ["Save current question", ["Ctrl", "S"]],
                  ["Previous question", ["Alt", "←"]],
                  ["Next question", ["Alt", "→"]],
                  ["Close dialog or cancel", ["Esc"]],
                ].map(([label, keys]) => (
                  <SurfaceCard as="article" className="refined-shortcut-card" key={String(label)}>
                    <KeyboardIcon size={20} aria-hidden />
                    <strong>{label}</strong>
                    <span>
                      {(keys as string[]).map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  </SurfaceCard>
                ))}
              </div>
            </section>

            <SurfaceCard as="section" className="help-note">
              <MicrophoneIcon size={22} weight="duotone" aria-hidden />
              <div>
                <h2>Recording keyboard control</h2>
                <p>
                  Space starts or stops a response only while the recording controls have focus. No
                  shortcut runs while you are typing in a field or dialog.
                </p>
              </div>
            </SurfaceCard>
          </div>
        ) : null}
      </div>

      <Dialog.Root
        open={selectedAttempt !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteRecordingOpen(false);
            setSelectedAttempt(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="history-dialog-overlay" />
          <Dialog.Content
            className="history-dialog-content"
            aria-describedby="history-attempt-description"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => {
                if (historyDialogTriggerRef.current?.isConnected) {
                  historyDialogTriggerRef.current.focus();
                }
              });
            }}
          >
            {selectedAttempt ? (
              <>
                <header className="history-dialog-header">
                  <p>Speaking attempt</p>
                  <Dialog.Title>
                    {getTopic(topics, selectedAttempt)?.title ?? "Speaking practice"}
                  </Dialog.Title>
                  <Dialog.Description id="history-attempt-description">
                    {formatDateTime(selectedAttempt.createdAt)} ·{" "}
                    {formatDuration(selectedAttempt.durationSeconds)}
                  </Dialog.Description>
                </header>

                <section className="history-detail-section">
                  <h3>Prompt</h3>
                  <p>{getPrompt(topics, selectedAttempt)}</p>
                  <button
                    type="button"
                    className="ui-button ui-button--secondary"
                    onClick={() => {
                      setSelectedAttempt(null);
                      onOpenQuestion(selectedAttempt.topicId, selectedAttempt.questionIndex);
                    }}
                  >
                    Open this question
                    <ArrowRightIcon size={16} aria-hidden />
                  </button>
                </section>

                <section className="history-detail-section">
                  <h3>Recording</h3>
                  {recordingLoading ? (
                    <p role="status">Loading the saved recording…</p>
                  ) : recordingPlayback ? (
                    <div className="history-recording">
                      <p>
                        This audio is stored only on this device and remains available after
                        relaunch.
                      </p>
                      {/* biome-ignore lint/a11y/useMediaCaption: This is the learner's own speech recording and may not have a transcript. */}
                      <audio
                        className="history-recording-audio"
                        controls
                        preload="metadata"
                        src={recordingPlayback.url}
                        aria-label="Playback of this speaking attempt"
                      />
                      {recordingPlayback.transcript.trim() ? (
                        <details className="transcript-details">
                          <summary>Review saved transcript</summary>
                          <p>{recordingPlayback.transcript}</p>
                        </details>
                      ) : null}
                      <button
                        type="button"
                        className="ui-button ui-button--danger"
                        onClick={() => setDeleteRecordingOpen(true)}
                        ref={deleteRecordingButtonRef}
                      >
                        <TrashIcon size={17} aria-hidden />
                        Delete recording
                      </button>
                    </div>
                  ) : selectedAttempt.recordingAvailable ? (
                    <p>
                      The recording is no longer available on this device. The prompt, timing, and
                      notes are still safe.
                    </p>
                  ) : (
                    <p>
                      Audio was not saved with this attempt. The prompt, timing, and notes remain
                      available.
                    </p>
                  )}
                  {recordingError ? (
                    <p className="history-recording-error" role="alert">
                      {recordingError}
                    </p>
                  ) : null}
                </section>

                <section className="history-detail-section">
                  <label htmlFor="attempt-notes">
                    <NotePencilIcon size={18} aria-hidden />
                    Notes
                  </label>
                  <textarea
                    id="attempt-notes"
                    rows={4}
                    value={attemptNotes}
                    maxLength={1_000}
                    placeholder="Add a note about pacing, structure, vocabulary, or pronunciation."
                    onChange={(event) => setAttemptNotes(event.currentTarget.value)}
                  />
                  <small>{attemptNotes.length} / 1,000</small>
                </section>

                <footer className="history-dialog-actions">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="ui-button ui-button--secondary"
                      ref={historyDialogCloseButtonRef}
                    >
                      Close
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    className="ui-button ui-button--primary"
                    onClick={saveAttemptNotes}
                    disabled={attemptNotes.trim() === (selectedAttempt.notes ?? "").trim()}
                  >
                    Save notes
                  </button>
                </footer>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={deleteRecordingOpen && selectedAttempt !== null}
        onOpenChange={setDeleteRecordingOpen}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="history-dialog-overlay history-dialog-overlay--confirm" />
          <Dialog.Content
            className="history-dialog-content history-dialog-content--confirm"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (deleteRecordingButtonRef.current?.isConnected) {
                deleteRecordingButtonRef.current.focus();
              } else {
                historyDialogCloseButtonRef.current?.focus();
              }
            }}
          >
            <Dialog.Title>Delete this saved recording?</Dialog.Title>
            <Dialog.Description>
              The audio will be permanently removed from this device. The attempt prompt, timing,
              and notes will remain in History.
            </Dialog.Description>
            <div className="history-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="ui-button ui-button--secondary">
                  Keep recording
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="ui-button ui-button--danger"
                onClick={() => void deleteSelectedRecording()}
              >
                <TrashIcon size={17} aria-hidden />
                Delete recording
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
