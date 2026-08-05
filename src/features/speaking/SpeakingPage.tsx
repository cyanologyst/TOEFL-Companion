import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioWaveform } from "../../components/AudioWaveform";
import { DoodleIcon } from "../../components/DoodleIcon";
import { Modal } from "../../components/Modal";
import { SegmentedControl, StudyAccordion } from "../../components/StudyUI";
import rawListenRepeat from "../../data/listen-repeat.json";
import rawTopics from "../../data/toefl-data.json";
import { useSpeakingRecorder } from "../../hooks/useSpeakingRecorder";
import { countWords } from "../../lib/question";
import { learningRepository } from "../../services/learningRepository";
import { studyRepository } from "../../services/studyRepository";
import type { ListenRepeatLibrary } from "../../types/study";
import type {
  AttemptHistoryItem,
  Question,
  SavedRecordingMetadata,
  Topic,
} from "../../types/toefl";
import "./speaking.css";

type SpeakingMode = "interview" | "repeat";
type InterviewMode = "practice" | "exam";
type TopicSort = "library" | "recent" | "progress" | "bookmarked";
type SpeakingSupportKind = "ideas" | "collocations" | "samples";

interface SpeakingPageProps {
  interviewSeconds: number;
  initialTopicId?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onNotice: (message: string) => void;
  onSaved: () => void;
}

interface TopicProgress {
  attempts: number;
  completedQuestions: number;
  percent: number;
  bookmarkedQuestions: number;
  lastPracticedAt: string | null;
  status: "ready" | "in-progress" | "completed";
}

interface TranscriptDifferences {
  missing: string[];
  extra: string[];
  changed: string[];
}

const topics = rawTopics as Topic[];
const listenRepeat = rawListenRepeat as ListenRepeatLibrary;
const WAVEFORM_BARS = Array.from({ length: 46 }, (_, position) => ({
  id: `prompt-wave-${position + 1}`,
  height: 8 + ((position * 17) % 28),
}));

function normalizeTokens(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

function editDistance(left: string[], right: string[]): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const substitution = diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        substitution,
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function transcriptAccuracy(expected: string, actual: string): number {
  const expectedTokens = normalizeTokens(expected);
  const actualTokens = normalizeTokens(actual);
  if (!expectedTokens.length || !actualTokens.length) {
    return 0;
  }
  const distance = editDistance(expectedTokens, actualTokens);
  return Math.max(
    0,
    Math.round((1 - distance / Math.max(expectedTokens.length, actualTokens.length)) * 100),
  );
}

function estimatedListenRepeatBand(expected: string, actual: string): number {
  const expectedTokens = normalizeTokens(expected);
  const actualTokens = normalizeTokens(actual);
  if (!actualTokens.length) {
    return 0;
  }
  if (expectedTokens.join(" ") === actualTokens.join(" ")) {
    return 5;
  }
  const accuracy = transcriptAccuracy(expected, actual);
  if (accuracy >= 80) {
    return 4;
  }
  if (accuracy >= 60) {
    return 3;
  }
  if (accuracy >= 30) {
    return 2;
  }
  return 1;
}

const LISTEN_REPEAT_BAND_DESCRIPTIONS = [
  "No usable English response was recognized.",
  "Only a few words from the prompt were captured.",
  "A significant part of the prompt is missing or inaccurate.",
  "The response is mostly complete, but wording changes affect the original meaning.",
  "The response preserves the meaning with only minor wording changes.",
  "The response repeats the prompt exactly.",
] as const;

function formatPromptDuration(durationSeconds: number | null): string {
  if (!durationSeconds) {
    return "TTS preview";
  }
  const roundedSeconds = Math.max(1, Math.ceil(durationSeconds));
  return `0:${String(roundedSeconds).padStart(2, "0")}`;
}

function listenRepeatResponseSeconds(promptIndex: number): 8 | 10 | 12 {
  if (promptIndex < 2) {
    return 8;
  }
  if (promptIndex < 5) {
    return 10;
  }
  return 12;
}

function compareTranscripts(expected: string, actual: string): TranscriptDifferences {
  const expectedTokens = normalizeTokens(expected);
  const actualTokens = normalizeTokens(actual);
  const matrix = Array.from({ length: expectedTokens.length + 1 }, (_, expectedIndex) =>
    Array.from({ length: actualTokens.length + 1 }, (_, actualIndex) =>
      expectedIndex === 0 ? actualIndex : actualIndex === 0 ? expectedIndex : 0,
    ),
  );

  for (let expectedIndex = 1; expectedIndex <= expectedTokens.length; expectedIndex += 1) {
    for (let actualIndex = 1; actualIndex <= actualTokens.length; actualIndex += 1) {
      matrix[expectedIndex][actualIndex] = Math.min(
        matrix[expectedIndex - 1][actualIndex] + 1,
        matrix[expectedIndex][actualIndex - 1] + 1,
        matrix[expectedIndex - 1][actualIndex - 1] +
          (expectedTokens[expectedIndex - 1] === actualTokens[actualIndex - 1] ? 0 : 1),
      );
    }
  }

  const missing: string[] = [];
  const extra: string[] = [];
  const changed: string[] = [];
  let expectedIndex = expectedTokens.length;
  let actualIndex = actualTokens.length;

  while (expectedIndex > 0 || actualIndex > 0) {
    if (
      expectedIndex > 0 &&
      actualIndex > 0 &&
      expectedTokens[expectedIndex - 1] === actualTokens[actualIndex - 1]
    ) {
      expectedIndex -= 1;
      actualIndex -= 1;
      continue;
    }

    if (
      expectedIndex > 0 &&
      actualIndex > 0 &&
      matrix[expectedIndex][actualIndex] === matrix[expectedIndex - 1][actualIndex - 1] + 1
    ) {
      changed.push(`${expectedTokens[expectedIndex - 1]} → ${actualTokens[actualIndex - 1]}`);
      expectedIndex -= 1;
      actualIndex -= 1;
      continue;
    }

    if (
      expectedIndex > 0 &&
      matrix[expectedIndex][actualIndex] === matrix[expectedIndex - 1][actualIndex] + 1
    ) {
      missing.push(expectedTokens[expectedIndex - 1]);
      expectedIndex -= 1;
      continue;
    }

    if (actualIndex > 0) {
      extra.push(actualTokens[actualIndex - 1]);
      actualIndex -= 1;
    }
  }

  return {
    missing: missing.reverse(),
    extra: extra.reverse(),
    changed: changed.reverse(),
  };
}

function formatCategory(category: string): string {
  return category.replace(/\s*&\s*/gu, " & ");
}

function questionKey(topicId: number, questionIndex: number): string {
  return `${topicId}-${questionIndex + 1}`;
}

function resolveTopicId(value?: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return topics.some((topic) => topic.id === parsed) ? parsed : null;
}

function summarizeWords(words: string[]): Array<{ key: string; label: string }> {
  const counts = new Map<string, number>();
  words.forEach((word) => {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  });
  return [...counts.entries()].map(([word, count]) => ({
    key: word,
    label: count > 1 ? `${word} ×${count}` : word,
  }));
}

export function SpeakingPage({
  interviewSeconds,
  initialTopicId,
  onDirtyChange,
  onNotice,
  onSaved,
}: SpeakingPageProps): React.JSX.Element {
  const [mode, setMode] = useState<SpeakingMode>("interview");
  const [selectedTopicId, setSelectedTopicId] = useState<number>(
    () => resolveTopicId(initialTopicId) ?? topics[0].id,
  );
  const [activeTopicId, setActiveTopicId] = useState<number | null>(null);
  const [previewQuestionIndex, setPreviewQuestionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All topics");
  const [sort, setSort] = useState<TopicSort>("library");
  const [history, setHistory] = useState(() => learningRepository.getHistory());
  const [savedKeys, setSavedKeys] = useState(() => learningRepository.getSavedKeys());
  const [hasProtectedRecording, setHasProtectedRecording] = useState(false);
  const topicButtonRefs = useRef(new Map<number, HTMLButtonElement>());
  const topicNavigatorScrollRef = useRef<HTMLElement>(null);
  const revealTopicInNavigator = useCallback((topicId: number) => {
    const selectedButton = topicButtonRefs.current.get(topicId);
    const scrollContainer = topicNavigatorScrollRef.current;
    if (!selectedButton || !scrollContainer) {
      return;
    }
    const containerRect = scrollContainer.getBoundingClientRect();
    const buttonRect = selectedButton.getBoundingClientRect();
    if (buttonRect.top < containerRect.top) {
      scrollContainer.scrollTop -= containerRect.top - buttonRect.top;
    } else if (buttonRect.bottom > containerRect.bottom) {
      scrollContainer.scrollTop += buttonRect.bottom - containerRect.bottom;
    }
  }, []);

  const updateRecordingProtection = useCallback(
    (dirty: boolean) => {
      setHasProtectedRecording(dirty);
      onDirtyChange?.(dirty);
    },
    [onDirtyChange],
  );

  useEffect(() => {
    const nextTopicId = resolveTopicId(initialTopicId);
    if (nextTopicId !== null) {
      setMode("interview");
      setSelectedTopicId(nextTopicId);
      setPreviewQuestionIndex(0);
      setQuestionIndex(0);
      setActiveTopicId(null);
    }
  }, [initialTopicId]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange],
  );

  const refreshLearningState = useCallback(() => {
    setHistory(learningRepository.getHistory());
    setSavedKeys(learningRepository.getSavedKeys());
    onSaved();
  }, [onSaved]);

  const categories = useMemo(
    () => ["All topics", ...new Set(topics.map((topic) => topic.category))],
    [],
  );

  const progressByTopic = useMemo(
    () =>
      new Map<number, TopicProgress>(
        topics.map((topic) => {
          const attempts = history.filter((item) => item.topicId === topic.id);
          const completedQuestions = new Set(attempts.map((item) => item.questionIndex)).size;
          const percent = Math.round((completedQuestions / topic.questions.length) * 100);
          const bookmarkedQuestions = topic.questions.filter((_, index) =>
            savedKeys.includes(questionKey(topic.id, index)),
          ).length;
          const lastPracticedAt =
            attempts
              .map((item) => item.createdAt)
              .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
          return [
            topic.id,
            {
              attempts: attempts.length,
              completedQuestions,
              percent,
              bookmarkedQuestions,
              lastPracticedAt,
              status:
                completedQuestions >= topic.questions.length
                  ? "completed"
                  : completedQuestions > 0
                    ? "in-progress"
                    : "ready",
            },
          ];
        }),
      ),
    [history, savedKeys],
  );

  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = topics.filter(
      (topic) =>
        (category === "All topics" || topic.category === category) &&
        (!normalized ||
          topic.title.toLocaleLowerCase().includes(normalized) ||
          topic.category.toLocaleLowerCase().includes(normalized) ||
          topic.questions.some((question) =>
            question.prompt.toLocaleLowerCase().includes(normalized),
          )),
    );

    return [...matches].sort((left, right) => {
      const leftProgress = progressByTopic.get(left.id)!;
      const rightProgress = progressByTopic.get(right.id)!;
      if (sort === "recent") {
        return (
          Date.parse(rightProgress.lastPracticedAt ?? "1970-01-01") -
          Date.parse(leftProgress.lastPracticedAt ?? "1970-01-01")
        );
      }
      if (sort === "progress") {
        return leftProgress.percent - rightProgress.percent || left.id - right.id;
      }
      if (sort === "bookmarked") {
        return (
          rightProgress.bookmarkedQuestions - leftProgress.bookmarkedQuestions || left.id - right.id
        );
      }
      return left.id - right.id;
    });
  }, [category, progressByTopic, query, sort]);

  const topicGroups = useMemo(
    () =>
      categories
        .filter((item) => item !== "All topics")
        .map((groupCategory) => ({
          category: groupCategory,
          topics: filteredTopics.filter((topic) => topic.category === groupCategory),
        }))
        .filter((group) => group.topics.length > 0),
    [categories, filteredTopics],
  );
  const visuallyOrderedTopics = useMemo(
    () => topicGroups.flatMap((group) => group.topics),
    [topicGroups],
  );

  const selectTopicForPreview = useCallback(
    (topicId: number) => {
      const topic = topics.find((item) => item.id === topicId);
      if (!topic) {
        return;
      }
      const practiced = new Set(
        history.filter((item) => item.topicId === topicId).map((item) => item.questionIndex),
      );
      const firstUnpracticed = topic.questions.findIndex((_, index) => !practiced.has(index));
      setSelectedTopicId(topicId);
      setPreviewQuestionIndex(firstUnpracticed >= 0 ? firstUnpracticed : 0);
    },
    [history],
  );

  useEffect(() => {
    if (
      filteredTopics.length > 0 &&
      !filteredTopics.some((topic) => topic.id === selectedTopicId)
    ) {
      selectTopicForPreview(filteredTopics[0].id);
    }
  }, [filteredTopics, selectTopicForPreview, selectedTopicId]);

  useEffect(() => {
    revealTopicInNavigator(selectedTopicId);
  }, [revealTopicInNavigator, selectedTopicId]);

  const activeTopic = topics.find((topic) => topic.id === activeTopicId) ?? null;
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const selectedTopicProgress = progressByTopic.get(selectedTopic.id)!;
  const selectedFilteredIndex = filteredTopics.findIndex((topic) => topic.id === selectedTopic.id);

  const handleTopicNavigatorKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    topicId: number,
  ) => {
    const visualIndex = visuallyOrderedTopics.findIndex((topic) => topic.id === topicId);
    if (visualIndex < 0) {
      return;
    }
    let nextTopicId: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextTopicId =
        visuallyOrderedTopics[Math.min(visuallyOrderedTopics.length - 1, visualIndex + 1)]?.id ??
        null;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextTopicId = visuallyOrderedTopics[Math.max(0, visualIndex - 1)]?.id ?? null;
    } else if (event.key === "Home") {
      nextTopicId = filteredTopics[0]?.id ?? null;
    } else if (event.key === "End") {
      nextTopicId = filteredTopics.at(-1)?.id ?? null;
    }
    if (nextTopicId === null || nextTopicId === topicId) {
      return;
    }
    event.preventDefault();
    revealTopicInNavigator(nextTopicId);
    topicButtonRefs.current.get(nextTopicId)?.focus({ preventScroll: true });
    selectTopicForPreview(nextTopicId);
  };

  const toggleBookmark = (topicId: number, index: number) => {
    const key = questionKey(topicId, index);
    const isSaved = savedKeys.includes(key);
    const next = isSaved ? savedKeys.filter((item) => item !== key) : [...savedKeys, key];
    learningRepository.setSavedKeys(next);
    setSavedKeys(next);
    onSaved();
    onNotice(isSaved ? "Question removed from saved items." : "Question saved for later.");
  };

  return (
    <div className={`speaking${!activeTopic && mode === "repeat" ? " speaking--repeat" : ""}`}>
      {!activeTopic ? (
        <>
          <header className="speaking__head">
            <div className="speaking__title">
              <span className="speaking__title-icon">
                <DoodleIcon name="mic" size={24} />
              </span>
              <div>
                <h1>Speaking</h1>
                <p>Build natural interview answers and accurate spoken repetition.</p>
              </div>
            </div>
            <SegmentedControl
              id="speaking-mode"
              className="speaking-mode-switch"
              label="Practice type"
              items={[
                {
                  value: "interview",
                  label: "Interview practice",
                  icon: "mic",
                  tabId: "speaking-interview-tab",
                  panelId: "speaking-interview-panel",
                },
                {
                  value: "repeat",
                  label: "Listen & Repeat",
                  icon: "headphone",
                  tabId: "speaking-repeat-tab",
                  panelId: "speaking-repeat-panel",
                },
              ]}
              value={mode}
              onValueChange={(nextMode) => {
                if (
                  hasProtectedRecording &&
                  !window.confirm(
                    "Discard the active or unsaved recording and change practice type?",
                  )
                ) {
                  return;
                }
                setMode(nextMode);
              }}
            />
          </header>

          {mode === "repeat" ? (
            <div
              id="speaking-repeat-panel"
              role="tabpanel"
              aria-labelledby="speaking-repeat-tab"
              className="speaking__body speaking__body--repeat"
            >
              <ListenRepeatWorkspace
                onNotice={onNotice}
                onSaved={onSaved}
                onRecordingStateChange={updateRecordingProtection}
              />
            </div>
          ) : (
            <div
              id="speaking-interview-panel"
              role="tabpanel"
              aria-labelledby="speaking-interview-tab"
              className="speaking__body"
            >
              {/* Search and filters live inside the rail they act on, rather
                  than as a full-width toolbar above the whole page. */}
              <aside className="speaking-rail" aria-label="Interview topics">
                <div className="speaking-rail__head">
                  <div className="speaking-rail__title">
                    <h2>NEO interview library</h2>
                    <span className="speaking-rail__count" aria-live="polite">
                      {filteredTopics.length}/{topics.length}
                    </span>
                  </div>

                  <label className="speaking-rail__search">
                    <DoodleIcon name="search" size={16} />
                    <span className="visually-hidden">Search speaking sets</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search topics or questions…"
                    />
                  </label>

                  <div className="speaking-rail__filters">
                    <label>
                      <span>Group</span>
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                      >
                        {categories.map((item) => (
                          <option key={item} value={item}>
                            {formatCategory(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Sort</span>
                      <select
                        value={sort}
                        onChange={(event) => setSort(event.target.value as TopicSort)}
                      >
                        <option value="library">Library order</option>
                        <option value="recent">Recently practiced</option>
                        <option value="progress">Needs practice</option>
                        <option value="bookmarked">Most bookmarked</option>
                      </select>
                    </label>
                  </div>
                </div>

                <nav
                  ref={topicNavigatorScrollRef}
                  className="speaking-rail__scroll"
                  aria-label="Interview topics"
                >
                  {topicGroups.map((group) => {
                    const groupId = `speaking-topic-group-${group.category
                      .toLocaleLowerCase()
                      .replace(/[^a-z0-9]+/gu, "-")}`;
                    return (
                      <section
                        key={group.category}
                        className="speaking-rail__group"
                        aria-labelledby={groupId}
                      >
                        <h3 id={groupId}>
                          {formatCategory(group.category)}
                          <span>{group.topics.length}</span>
                        </h3>
                        {group.topics.map((topic) => {
                          const progress = progressByTopic.get(topic.id)!;
                          const selected = selectedTopic.id === topic.id;
                          return (
                            <button
                              key={topic.id}
                              ref={(node) => {
                                if (node) {
                                  topicButtonRefs.current.set(topic.id, node);
                                } else {
                                  topicButtonRefs.current.delete(topic.id);
                                }
                              }}
                              type="button"
                              className="speaking-topic"
                              data-active={selected}
                              data-status={progress.status}
                              aria-current={selected ? "page" : undefined}
                              tabIndex={
                                selected ||
                                (selectedFilteredIndex < 0 && topic.id === filteredTopics[0]?.id)
                                  ? 0
                                  : -1
                              }
                              onClick={() => selectTopicForPreview(topic.id)}
                              onKeyDown={(event) => handleTopicNavigatorKeyDown(event, topic.id)}
                            >
                              <span className="speaking-topic__num">
                                {String(topic.id).padStart(2, "0")}
                              </span>
                              <span className="speaking-topic__copy">
                                <strong>{topic.title}</strong>
                                <small>
                                  {progress.completedQuestions}/{topic.questions.length} complete
                                </small>
                              </span>
                              <span className="speaking-topic__pct">{progress.percent}%</span>
                            </button>
                          );
                        })}
                      </section>
                    );
                  })}
                </nav>

                <footer className="speaking-rail__foot">
                  <span>{filteredTopics.length * 4} questions shown</span>
                  <span>{savedKeys.length} saved</span>
                </footer>
              </aside>

              {filteredTopics.length ? (
                <SelectedTopicOverview
                  key={selectedTopic.id}
                  topic={selectedTopic}
                  progress={selectedTopicProgress}
                  questionIndex={previewQuestionIndex}
                  bookmarked={savedKeys.includes(
                    questionKey(selectedTopic.id, previewQuestionIndex),
                  )}
                  onQuestionChange={setPreviewQuestionIndex}
                  onToggleBookmark={() => toggleBookmark(selectedTopic.id, previewQuestionIndex)}
                  onStart={() => {
                    setQuestionIndex(previewQuestionIndex);
                    setActiveTopicId(selectedTopic.id);
                  }}
                />
              ) : (
                <div className="speaking-empty-detail">
                  <DoodleIcon name="search" size={30} />
                  <strong>No matching speaking sets</strong>
                  <p>Try another search phrase or clear the active topic filter.</p>
                  <button
                    type="button"
                    className="button button--outline"
                    onClick={() => {
                      setQuery("");
                      setCategory("All topics");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <InterviewPractice
          key={activeTopic.id}
          topic={activeTopic}
          questionIndex={questionIndex}
          maxSeconds={interviewSeconds}
          bookmarked={savedKeys.includes(questionKey(activeTopic.id, questionIndex))}
          onToggleBookmark={() => toggleBookmark(activeTopic.id, questionIndex)}
          onBack={() => {
            setActiveTopicId(null);
            refreshLearningState();
          }}
          onQuestionChange={setQuestionIndex}
          onNotice={onNotice}
          onSaved={refreshLearningState}
          onRecordingStateChange={updateRecordingProtection}
        />
      )}
    </div>
  );
}

function SpeakingSupportDialog({
  kind,
  topicTitle,
  questionNumber,
  question,
  onClose,
}: {
  kind: SpeakingSupportKind;
  topicTitle: string;
  questionNumber: number;
  question: Question;
  onClose: () => void;
}): React.JSX.Element {
  const title =
    kind === "ideas"
      ? "Ideas to consider"
      : kind === "collocations"
        ? "Useful collocations"
        : "Sample answers";

  return (
    <Modal
      open
      title={title}
      description={`${topicTitle} · Question ${questionNumber}`}
      onClose={onClose}
    >
      <div className="speaking-support-dialog" data-kind={kind}>
        {kind === "ideas" ? (
          <ol className="speaking-support-dialog__ideas">
            {question.ideas.map((idea, index) => (
              <li key={idea}>
                <span>{index + 1}</span>
                <p>{idea}</p>
              </li>
            ))}
          </ol>
        ) : null}

        {kind === "collocations" ? (
          <ul className="speaking-support-dialog__collocations">
            {question.collocations.map((collocation) => {
              const [phrase, explanation] = collocation.split(" — ", 2);
              return (
                <li key={collocation}>
                  <strong>{phrase}</strong>
                  {explanation ? <span>{explanation}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {kind === "samples" ? (
          <div className="speaking-support-dialog__answers">
            <article>
              <h3>Sample answer 1</h3>
              <p>{question.answer}</p>
            </article>
            <article>
              <h3>Sample answer 2</h3>
              <p>{question.answer2}</p>
            </article>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function SelectedTopicOverview({
  topic,
  progress,
  questionIndex,
  bookmarked,
  onQuestionChange,
  onToggleBookmark,
  onStart,
}: {
  topic: Topic;
  progress: TopicProgress;
  questionIndex: number;
  bookmarked: boolean;
  onQuestionChange: (index: number) => void;
  onToggleBookmark: () => void;
  onStart: () => void;
}): React.JSX.Element {
  const [supportDialog, setSupportDialog] = useState<SpeakingSupportKind | null>(null);
  const [prepTab, setPrepTab] = useState<SpeakingSupportKind>("ideas");
  const questionTabRefs = useRef(new Map<number, HTMLButtonElement>());
  const questionTabBaseId = `speaking-topic-${topic.id}-questions`;
  const activeQuestion = topic.questions[questionIndex];
  const actionLabel =
    progress.status === "ready"
      ? "Start practice"
      : progress.status === "completed"
        ? "Practice again"
        : "Continue practice";

  const prepTabs: Array<{ value: SpeakingSupportKind; label: string; count: number }> = [
    { value: "ideas", label: "Ideas", count: activeQuestion.ideas.length },
    {
      value: "collocations",
      label: "Collocations",
      count: activeQuestion.collocations.length,
    },
    { value: "samples", label: "Sample answers", count: 2 },
  ];

  return (
    <div className="speaking-detail" data-status={progress.status}>
      <section className="speaking-card speaking-question" aria-label="Question preview">
        <div className="speaking-question__top">
          <div className="speaking-question__meta">
            <strong>{topic.title}</strong>
            <span>
              {formatCategory(topic.category)} · {progress.completedQuestions}/
              {topic.questions.length} complete
            </span>
          </div>

          <div className="speaking-question__controls">
            {/* One panel, four tabs: the questions share a single region that
                swaps content, so roving tabindex moves focus while only the
                selected tab owns the panel. */}
            <div
              className="speaking-qpicker"
              role="tablist"
              aria-label={`${topic.title} questions`}
              onKeyDown={(event) => {
                const last = topic.questions.length - 1;
                let next: number | null = null;
                if (event.key === "ArrowRight") {
                  next = questionIndex === last ? 0 : questionIndex + 1;
                } else if (event.key === "ArrowLeft") {
                  next = questionIndex === 0 ? last : questionIndex - 1;
                } else if (event.key === "Home") {
                  next = 0;
                } else if (event.key === "End") {
                  next = last;
                }
                if (next !== null) {
                  event.preventDefault();
                  setSupportDialog(null);
                  onQuestionChange(next);
                  questionTabRefs.current.get(next)?.focus();
                }
              }}
            >
              {topic.questions.map((item, index) => (
                <button
                  key={item.prompt}
                  ref={(node) => {
                    if (node) {
                      questionTabRefs.current.set(index, node);
                    } else {
                      questionTabRefs.current.delete(index);
                    }
                  }}
                  type="button"
                  role="tab"
                  id={`${questionTabBaseId}-tab-${index}`}
                  aria-controls={`${questionTabBaseId}-panel`}
                  aria-selected={index === questionIndex}
                  tabIndex={index === questionIndex ? 0 : -1}
                  data-active={index === questionIndex}
                  onClick={() => {
                    setSupportDialog(null);
                    onQuestionChange(index);
                  }}
                >
                  Q{index + 1}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={bookmarked ? "Remove question bookmark" : "Bookmark this question"}
              aria-pressed={bookmarked}
              title={bookmarked ? "Remove bookmark" : "Save question"}
              onClick={onToggleBookmark}
            >
              <DoodleIcon name="bookmark" size={19} />
            </button>
          </div>
        </div>

        <div
          className="speaking-question__panel"
          id={`${questionTabBaseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${questionTabBaseId}-tab-${questionIndex}`}
        >
          <p className="speaking-question__prompt">{activeQuestion.prompt}</p>

          <p className="speaking-question__hint">
            <DoodleIcon name="bulb" size={17} />
            {activeQuestion.plan}
          </p>
        </div>
      </section>

      {/* One preparation panel rather than three side-by-side cells: the cells
          were narrow enough that every idea, phrase, and sample was truncated. */}
      <section className="speaking-card speaking-prep" aria-label="Preparation material">
        <div className="speaking-prep__head">
          <h2 className="visually-hidden">Preparation</h2>
          <div className="speaking-prep__actions">
            <div className="speaking-tabs" role="tablist" aria-label="Preparation material">
              {prepTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={prepTab === tab.value}
                  data-active={prepTab === tab.value}
                  onClick={() => setPrepTab(tab.value)}
                >
                  {tab.label}
                  <small>{tab.count}</small>
                </button>
              ))}
            </div>
            {/* Named for what it opens, not for what it is: "Open full" alone
                gives a screen-reader user no idea which list appears. */}
            <button
              type="button"
              className="button button--quiet button--small"
              aria-haspopup="dialog"
              aria-label={
                prepTab === "ideas"
                  ? `View all ${activeQuestion.ideas.length} ideas`
                  : prepTab === "collocations"
                    ? `View all ${activeQuestion.collocations.length} collocations`
                    : "View both sample answers"
              }
              onClick={() => setSupportDialog(prepTab)}
            >
              Open full
            </button>
          </div>
        </div>

        <div className="speaking-prep__body">
          {prepTab === "ideas" ? (
            <ul className="speaking-prep__list">
              {activeQuestion.ideas.map((idea) => (
                <li key={idea}>{idea}</li>
              ))}
            </ul>
          ) : prepTab === "collocations" ? (
            <ul className="speaking-prep__list">
              {activeQuestion.collocations.map((collocation) => (
                <li key={collocation}>{collocation}</li>
              ))}
            </ul>
          ) : (
            <div className="speaking-prep__samples">
              <section>
                <h3>Sample 1</h3>
                <p>{activeQuestion.answer}</p>
              </section>
              <section>
                <h3>Sample 2</h3>
                <p>{activeQuestion.answer2}</p>
              </section>
            </div>
          )}
        </div>
      </section>

      <div className="speaking-start">
        <div className="speaking-start__copy">
          <strong>Ready for question {questionIndex + 1}?</strong>
          <span>The recorder opens only when you start practice.</span>
        </div>
        <button type="button" className="button button--primary" onClick={onStart}>
          <DoodleIcon name="mic" size={18} />
          {actionLabel}
        </button>
      </div>

      {supportDialog ? (
        <SpeakingSupportDialog
          kind={supportDialog}
          topicTitle={topic.title}
          questionNumber={questionIndex + 1}
          question={activeQuestion}
          onClose={() => setSupportDialog(null)}
        />
      ) : null}
    </div>
  );
}

function InterviewPractice({
  topic,
  questionIndex,
  maxSeconds,
  bookmarked,
  onToggleBookmark,
  onBack,
  onQuestionChange,
  onNotice,
  onSaved,
  onRecordingStateChange,
}: {
  topic: Topic;
  questionIndex: number;
  maxSeconds: number;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onBack: () => void;
  onQuestionChange: (index: number) => void;
  onNotice: (message: string) => void;
  onSaved: () => void;
  onRecordingStateChange: (dirty: boolean) => void;
}): React.JSX.Element {
  const [interviewMode, setInterviewMode] = useState<InterviewMode>("practice");
  const question = topic.questions[questionIndex];

  const handleSave = (result: SavedRecordingMetadata) => {
    const historyItem: AttemptHistoryItem = {
      id: crypto.randomUUID(),
      topicId: topic.id,
      questionIndex,
      createdAt: result.createdAt,
      durationSeconds: result.durationSeconds,
      wordCount: countWords(result.transcript),
      promptSnapshot: question.prompt,
      recordingAvailable: true,
      recordingId: result.id,
      mimeType: result.mimeType,
      size: result.size,
    };
    learningRepository.setHistory([historyItem, ...learningRepository.getHistory()].slice(0, 200));
    studyRepository.addActivity(
      "speaking",
      `Completed ${topic.title}`,
      `${historyItem.wordCount} spoken words`,
    );
    onSaved();
    onNotice("Speaking attempt saved on this device.");
  };

  const recorder = useSpeakingRecorder({
    maxSeconds,
    onSave: handleSave,
  });
  const activelyRecording =
    recorder.phase === "preparing" ||
    recorder.phase === "recording" ||
    recorder.phase === "requesting" ||
    recorder.phase === "retrying";
  const hasUnsavedDraft = Boolean(recorder.result) && recorder.phase !== "saved";
  const navigationLocked = recorder.phase === "saving";

  useEffect(() => {
    onRecordingStateChange(activelyRecording || hasUnsavedDraft);
    return () => onRecordingStateChange(false);
  }, [activelyRecording, hasUnsavedDraft, onRecordingStateChange]);

  useEffect(() => {
    if (!activelyRecording && !hasUnsavedDraft) {
      return;
    }
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [activelyRecording, hasUnsavedDraft]);

  const navigateSafely = (action: () => void) => {
    void (async () => {
      if (navigationLocked) {
        onNotice("Please wait while the recording is saved.");
        return;
      }

      if (activelyRecording) {
        const shouldDiscard = window.confirm(
          "Recording is in progress. Stop and discard it before leaving this question?",
        );
        if (!shouldDiscard) {
          return;
        }
        recorder.cancel();
      } else if (hasUnsavedDraft) {
        const shouldDiscard = window.confirm(
          "This recording has not been saved. Discard it and leave this question?",
        );
        if (!shouldDiscard || !(await recorder.discard())) {
          return;
        }
      } else {
        recorder.reset();
      }
      action();
    })();
  };

  const statusTone =
    recorder.phase === "failed"
      ? "error"
      : recorder.phase === "recording"
        ? "recording"
        : recorder.phase === "completed"
          ? "draft"
          : recorder.phase === "saved"
            ? "saved"
            : "neutral";

  return (
    <div className="interview-practice" data-practice-mode={interviewMode}>
      <header className="practice-page-header interview-practice-header">
        <button
          type="button"
          className="back-button"
          disabled={navigationLocked}
          onClick={() => navigateSafely(onBack)}
        >
          <span aria-hidden>←</span> Speaking
        </button>
        <div>
          <p className="practice-eyebrow">
            NEO {topic.id} · {formatCategory(topic.category)}
          </p>
          <h1>{topic.title}</h1>
          <p>Answer naturally, as you would in the updated TOEFL interview.</p>
        </div>
        <fieldset className="interview-mode-control">
          <legend className="visually-hidden">Interview mode</legend>
          <button
            type="button"
            aria-pressed={interviewMode === "practice"}
            data-active={interviewMode === "practice"}
            onClick={() => setInterviewMode("practice")}
          >
            Practice
          </button>
          <button
            type="button"
            aria-pressed={interviewMode === "exam"}
            data-active={interviewMode === "exam"}
            onClick={() => setInterviewMode("exam")}
          >
            Exam
          </button>
        </fieldset>
      </header>

      <div className="interview-grid" data-mode={interviewMode}>
        <section className="panel interview-question">
          <header>
            <span>Question {questionIndex + 1}</span>
            <strong>{topic.questions.length} questions in this set</strong>
            <button
              type="button"
              className="icon-button question-bookmark"
              aria-label={bookmarked ? "Remove question bookmark" : "Bookmark this question"}
              aria-pressed={bookmarked}
              title={bookmarked ? "Remove bookmark" : "Save question"}
              onClick={onToggleBookmark}
            >
              <DoodleIcon name="bookmark" size={20} />
            </button>
          </header>
          <div className="interview-question__body">
            <span className="question-doodle">
              <DoodleIcon name="mic" size={42} />
            </span>
            <div>
              <p>{question.prompt}</p>
              {interviewMode === "practice" ? (
                <small>Give one clear reason and a specific example.</small>
              ) : (
                <small>Exam mode · Support material is hidden.</small>
              )}
            </div>
          </div>
        </section>

        <section
          className="panel interview-recorder"
          aria-busy={activelyRecording || recorder.phase === "saving"}
        >
          <header className="interview-recorder__header">
            <div>
              <h2>Response timer</h2>
              <p>{maxSeconds}-second response</p>
            </div>
            <span className="recorder-phase-badge" data-tone={statusTone}>
              {recorder.phase === "recording"
                ? "Recording"
                : recorder.phase === "completed"
                  ? "Draft ready"
                  : recorder.phase === "saved"
                    ? "Saved"
                    : recorder.phase === "failed"
                      ? "Needs attention"
                      : recorder.phase === "preparing"
                        ? "Get ready"
                        : "Ready"}
            </span>
          </header>
          <div
            className="countdown-ring"
            role="timer"
            aria-label={`${
              recorder.phase === "preparing" ? recorder.countdown : recorder.secondsLeft
            } seconds remaining`}
            style={
              {
                "--progress": `${
                  recorder.phase === "recording" ? (recorder.secondsLeft / maxSeconds) * 360 : 360
                }deg`,
              } as React.CSSProperties
            }
          >
            <strong>
              {recorder.phase === "preparing" ? recorder.countdown : recorder.secondsLeft}
            </strong>
            <span>{recorder.phase === "preparing" ? "get ready" : "seconds"}</span>
          </div>
          <p className="recorder-status" role="status" aria-live="polite">
            {recorder.statusMessage}
          </p>
          {recorder.phase === "idle" || recorder.phase === "failed" ? (
            <button
              type="button"
              className="button button--primary button--record"
              disabled={!recorder.isSupported}
              onClick={() =>
                void (recorder.phase === "failed" ? recorder.retry() : recorder.start())
              }
            >
              <DoodleIcon name="mic" size={20} />
              {recorder.phase === "failed" ? "Try microphone again" : "Record response"}
            </button>
          ) : recorder.phase === "recording" ? (
            <button
              type="button"
              className="button button--danger button--record"
              disabled={recorder.isStopping}
              onClick={recorder.stop}
            >
              {recorder.isStopping ? "Finishing…" : "Stop recording"}
            </button>
          ) : null}
        </section>

        <section className="panel live-transcription">
          <header>
            <div>
              <h2>Live transcription</h2>
              <p>Speech recognition may be edited after recording.</p>
            </div>
            <span
              className="transcription-status"
              data-live={activelyRecording}
              role="status"
              aria-live="polite"
            >
              {activelyRecording
                ? "Live"
                : recorder.phase === "completed"
                  ? "Draft"
                  : recorder.phase === "saved"
                    ? "Saved"
                    : "Waiting"}
            </span>
          </header>
          <div className="transcription-canvas">
            {recorder.phase === "recording" ? (
              <AudioWaveform analyserRef={recorder.analyserRef} active />
            ) : null}
            <p>{recorder.transcript || "Your spoken words will appear here while you record."}</p>
          </div>
          <footer>
            <span>
              Spoken words <strong>{countWords(recorder.transcript)}</strong>
            </span>
            {recorder.result ? (
              <audio controls src={recorder.result.url} aria-label="Recorded response playback">
                <track kind="captions" />
              </audio>
            ) : null}
          </footer>
          {recorder.result && recorder.phase !== "saved" ? (
            <div className="recording-actions">
              <button
                type="button"
                className="button button--outline"
                disabled={recorder.pendingAction !== null}
                onClick={() => void recorder.recordAgain()}
              >
                <DoodleIcon name="sync" size={17} />
                Retry
              </button>
              <button
                type="button"
                className="button button--quiet"
                disabled={recorder.pendingAction !== null}
                onClick={() => void recorder.discard()}
              >
                Discard draft
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={recorder.phase === "saving"}
                onClick={() => void recorder.save()}
              >
                <DoodleIcon name="floppy" size={17} />
                {recorder.phase === "saving" ? "Saving…" : "Save attempt"}
              </button>
            </div>
          ) : null}
          {recorder.error ? (
            <p className="inline-error" role="alert">
              {recorder.error}
            </p>
          ) : null}
        </section>

        {interviewMode === "practice" ? (
          <aside className="interview-materials" aria-label="Practice support">
            <StudyAccordion
              className="interview-support-accordion"
              defaultValue="ideas"
              items={[
                {
                  value: "ideas",
                  title: "Ideas to consider",
                  description: `${Math.min(question.ideas.length, 5)} prompts`,
                  icon: "bulb",
                  content: (
                    <ul>
                      {question.ideas.slice(0, 5).map((idea) => (
                        <li key={idea}>{idea}</li>
                      ))}
                    </ul>
                  ),
                },
                {
                  value: "collocations",
                  title: "Useful collocations",
                  description: `${Math.min(question.collocations.length, 5)} phrases`,
                  icon: "bookmark",
                  content: (
                    <ul>
                      {question.collocations.slice(0, 5).map((collocation) => (
                        <li key={collocation}>{collocation}</li>
                      ))}
                    </ul>
                  ),
                },
                {
                  value: "samples",
                  title: "Two sample answers",
                  description: "Compare two approaches",
                  icon: "doc",
                  content: (
                    <div className="sample-answer__content">
                      <section>
                        <h4>Sample 1</h4>
                        <p>{question.answer}</p>
                      </section>
                      <section>
                        <h4>Sample 2</h4>
                        <p>{question.answer2}</p>
                      </section>
                    </div>
                  ),
                },
              ]}
            />
          </aside>
        ) : null}
      </div>

      <footer className="question-navigation">
        <button
          type="button"
          className="button button--quiet"
          disabled={questionIndex === 0 || navigationLocked}
          onClick={() => navigateSafely(() => onQuestionChange(questionIndex - 1))}
        >
          <span aria-hidden>←</span> Previous
        </button>
        <nav className="question-number-list" aria-label="Questions in this set">
          {topic.questions.map((item, index) => (
            <button
              type="button"
              className="question-number-button"
              key={item.prompt}
              aria-label={`Question ${index + 1}`}
              aria-current={index === questionIndex ? "step" : undefined}
              data-active={index === questionIndex}
              disabled={navigationLocked}
              onClick={() => {
                if (index !== questionIndex) {
                  navigateSafely(() => onQuestionChange(index));
                }
              }}
            >
              {index + 1}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="button button--primary"
          disabled={navigationLocked}
          onClick={() =>
            navigateSafely(() =>
              questionIndex + 1 < topic.questions.length
                ? onQuestionChange(questionIndex + 1)
                : onBack(),
            )
          }
        >
          {questionIndex + 1 < topic.questions.length ? "Next question" : "Finish set"}
          <span aria-hidden>→</span>
        </button>
      </footer>
    </div>
  );
}

function ListenRepeatWorkspace({
  onNotice,
  onSaved,
  onRecordingStateChange,
}: {
  onNotice: (message: string) => void;
  onSaved: () => void;
  onRecordingStateChange: (dirty: boolean) => void;
}): React.JSX.Element {
  const [collectionIndex, setCollectionIndex] = useState(0);
  const collection = listenRepeat.collections[collectionIndex] ?? listenRepeat.collections[0];
  const [promptIndex, setPromptIndex] = useState(0);
  const prompt = collection.prompts[promptIndex];
  const [editedTranscript, setEditedTranscript] = useState("");
  const [playing, setPlaying] = useState(false);
  const [hasListened, setHasListened] = useState(false);
  const [hasCompared, setHasCompared] = useState(false);
  const [revealedPromptIds, setRevealedPromptIds] = useState(() => new Set<string>());
  const [completedPromptIds, setCompletedPromptIds] = useState(
    () =>
      new Set(
        studyRepository.getSnapshot().listenRepeatAttempts.map((attempt) => attempt.promptId),
      ),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const transcript = editedTranscript;
  const responseSeconds = listenRepeatResponseSeconds(promptIndex);
  const accuracy = hasCompared ? transcriptAccuracy(prompt.transcript, transcript) : null;
  const estimatedBand = hasCompared
    ? estimatedListenRepeatBand(prompt.transcript, transcript)
    : null;
  const differences = useMemo(
    () =>
      hasCompared
        ? compareTranscripts(prompt.transcript, transcript)
        : { missing: [], extra: [], changed: [] },
    [hasCompared, prompt.transcript, transcript],
  );

  const recorder = useSpeakingRecorder({
    maxSeconds: responseSeconds,
    preparationSeconds: 0,
    onSave: () => {
      studyRepository.addListenRepeatAttempt({
        promptId: prompt.id,
        transcript,
        accuracy: transcriptAccuracy(prompt.transcript, transcript),
      });
      setCompletedPromptIds((current) => new Set([...current, prompt.id]));
      onSaved();
      onNotice("Listen & Repeat attempt saved.");
    },
  });
  const activelyRecording =
    recorder.phase === "requesting" ||
    recorder.phase === "preparing" ||
    recorder.phase === "recording" ||
    recorder.phase === "retrying";
  const hasUnsavedDraft = Boolean(recorder.result) && recorder.phase !== "saved";

  useEffect(() => {
    onRecordingStateChange(activelyRecording || hasUnsavedDraft);
    return () => onRecordingStateChange(false);
  }, [activelyRecording, hasUnsavedDraft, onRecordingStateChange]);

  useEffect(() => {
    if (recorder.phase === "completed") {
      setEditedTranscript(recorder.transcript);
      setHasCompared(false);
      setRevealedPromptIds((current) => new Set([...current, prompt.id]));
    }
  }, [prompt.id, recorder.phase, recorder.transcript]);

  const stopPromptPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    }
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
    },
    [],
  );

  const togglePromptPlayback = () => {
    if (playing) {
      if (audioRef.current) {
        audioRef.current.pause();
      } else if ("speechSynthesis" in window) {
        speechSynthesis.pause();
      }
      setPlaying(false);
      return;
    }

    if (audioRef.current?.paused) {
      void audioRef.current.play().then(() => {
        setPlaying(true);
        setHasListened(true);
      });
      return;
    }

    if (utteranceRef.current && "speechSynthesis" in window && speechSynthesis.paused) {
      speechSynthesis.resume();
      setPlaying(true);
      setHasListened(true);
      return;
    }

    stopPromptPlayback();
    if (prompt.audioFile) {
      const audio = new Audio(prompt.audioFile);
      audioRef.current = audio;
      audio.addEventListener(
        "ended",
        () => {
          setPlaying(false);
          setHasListened(true);
          audioRef.current = null;
        },
        { once: true },
      );
      audio.addEventListener(
        "error",
        () => {
          setPlaying(false);
          audioRef.current = null;
          onNotice("The prompt audio file could not be played.");
        },
        { once: true },
      );
      void audio
        .play()
        .then(() => {
          setPlaying(true);
          setHasListened(true);
        })
        .catch(() => {
          setPlaying(false);
          audioRef.current = null;
          onNotice("The prompt audio file could not be played.");
        });
      return;
    }

    if (!("speechSynthesis" in window)) {
      onNotice("Text-to-speech is unavailable on this device.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(prompt.transcript);
    utterance.rate = 0.92;
    utterance.onend = () => {
      setPlaying(false);
      setHasListened(true);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setPlaying(false);
      utteranceRef.current = null;
    };
    utteranceRef.current = utterance;
    setPlaying(true);
    setHasListened(true);
    speechSynthesis.speak(utterance);
  };

  const resetPromptState = (nextCollectionIndex: number, nextPromptIndex: number) => {
    stopPromptPlayback();
    recorder.reset();
    setEditedTranscript("");
    setHasListened(false);
    setHasCompared(false);
    setCollectionIndex(nextCollectionIndex);
    setPromptIndex(nextPromptIndex);
  };

  const requestNavigation = (nextCollectionIndex: number, nextPromptIndex: number) => {
    if (nextCollectionIndex === collectionIndex && nextPromptIndex === promptIndex) {
      return;
    }
    void (async () => {
      const active =
        recorder.phase === "requesting" ||
        recorder.phase === "preparing" ||
        recorder.phase === "recording" ||
        recorder.phase === "retrying";
      const unsaved = Boolean(recorder.result) && recorder.phase !== "saved";
      if (recorder.phase === "saving") {
        onNotice("Please wait while the attempt is saved.");
        return;
      }
      if (active) {
        if (!window.confirm("Stop and discard the active recording to change prompts?")) {
          return;
        }
        recorder.cancel();
      } else if (unsaved) {
        if (
          !window.confirm("Discard this unsaved recording and change prompts?") ||
          !(await recorder.discard())
        ) {
          return;
        }
      }
      resetPromptState(nextCollectionIndex, nextPromptIndex);
    })();
  };

  const requestPromptChange = (index: number) => requestNavigation(collectionIndex, index);
  const requestCollectionChange = (index: number) => requestNavigation(index, 0);

  const recordEnabled = hasListened && !playing;
  const compareEnabled = Boolean(recorder.result && transcript.trim());
  const expectedTranscriptRevealed = revealedPromptIds.has(prompt.id);
  const completedCount = collection.prompts.filter((item) =>
    completedPromptIds.has(item.id),
  ).length;
  const stepStates = [
    hasListened ? "complete" : "current",
    recorder.result ? "complete" : hasListened ? "current" : "locked",
    hasCompared ? "complete" : recorder.result ? "current" : "locked",
    hasCompared ? "current" : "locked",
  ] as const;
  const hasNextPrompt = promptIndex + 1 < collection.prompts.length;
  const hasNextCollection = collectionIndex + 1 < listenRepeat.collections.length;
  const nextCollectionIndex = hasNextPrompt
    ? collectionIndex
    : hasNextCollection
      ? collectionIndex + 1
      : 0;
  const nextPromptIndex = hasNextPrompt ? promptIndex + 1 : 0;
  const continueLabel = hasNextPrompt
    ? `Continue to prompt ${promptIndex + 2}`
    : hasNextCollection
      ? `Continue to scenario ${collectionIndex + 2}`
      : "Review from the start";

  return (
    <div className="listen-repeat-layout">
      <aside className="panel prompt-queue" aria-label="Listen and Repeat prompt queue">
        <header>
          <div>
            <p>Scenario {collection.sequence ?? collectionIndex + 1}</p>
            <h2>{collection.title}</h2>
          </div>
          <span>
            {completedCount}/{collection.prompts.length} complete
          </span>
        </header>
        <label className="listen-scenario-picker">
          <span>Scenario</span>
          <select
            value={collectionIndex}
            onChange={(event) => requestCollectionChange(Number(event.currentTarget.value))}
          >
            {listenRepeat.collections.map((item, index) => (
              <option key={item.id} value={index}>
                {`${index + 1} · ${item.title} (${item.prompts.length}/${
                  item.totalPromptCount ?? item.prompts.length
                })`}
              </option>
            ))}
          </select>
        </label>
        <p className="prompt-queue__context">{collection.description}</p>
        <div
          className="prompt-queue__progress"
          role="progressbar"
          aria-label="Collection completion"
          aria-valuemin={0}
          aria-valuemax={collection.prompts.length}
          aria-valuenow={completedCount}
        >
          <i
            style={{
              width: `${(completedCount / collection.prompts.length) * 100}%`,
            }}
          />
        </div>
        <ol>
          {collection.prompts.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={index === promptIndex ? "step" : undefined}
                aria-label={`Prompt ${index + 1}, ${formatPromptDuration(
                  item.durationSeconds,
                )}${completedPromptIds.has(item.id) ? ", completed" : ""}`}
                data-active={index === promptIndex}
                data-complete={completedPromptIds.has(item.id)}
                onClick={() => requestPromptChange(index)}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>Prompt {index + 1}</strong>
                  <small>
                    {formatPromptDuration(item.durationSeconds)}
                    <i aria-hidden> / </i>
                    {completedPromptIds.has(item.id)
                      ? "Completed"
                      : index === promptIndex
                        ? "Current"
                        : "Not attempted"}
                  </small>
                </div>
                {completedPromptIds.has(item.id) ? (
                  <DoodleIcon name="checklist" size={18} />
                ) : index === promptIndex ? (
                  <DoodleIcon name="play" size={16} />
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <div className="listen-repeat-main">
        <ol className="listen-repeat-steps" aria-label="Listen and repeat workflow">
          {["Listen", "Record", "Compare", "Continue"].map((label, index) => (
            <li
              key={label}
              data-state={stepStates[index]}
              aria-current={stepStates[index] === "current" ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        <div className="listen-repeat-practice-grid">
          <section className="panel listen-prompt-card" data-step-state={stepStates[0]}>
            <header>
              <div>
                <p className="step-eyebrow">Step 1</p>
                <h2>Listen to the prompt</h2>
              </div>
              <span>{prompt.audioFile ? "Original source clip" : "Text-to-speech preview"}</span>
            </header>
            <div className="prompt-player">
              <button
                type="button"
                className="prompt-play"
                onClick={togglePromptPlayback}
                aria-label={playing ? "Pause prompt" : "Play prompt"}
                aria-pressed={playing}
              >
                <DoodleIcon name={playing ? "pause" : "play"} size={20} />
              </button>
              <div className="waveform-placeholder" aria-hidden>
                {WAVEFORM_BARS.map((bar) => (
                  <i
                    key={bar.id}
                    style={{
                      height: `${bar.height}px`,
                    }}
                  />
                ))}
              </div>
              <time>{formatPromptDuration(prompt.durationSeconds)}</time>
              {(audioRef.current || utteranceRef.current) && (
                <button
                  type="button"
                  className="button button--quiet prompt-stop"
                  onClick={stopPromptPlayback}
                >
                  Stop
                </button>
              )}
            </div>
            <div className="expected-transcript" data-revealed={expectedTranscriptRevealed}>
              {expectedTranscriptRevealed ? (
                <div className="expected-transcript__content">
                  <strong>Expected transcription</strong>
                  <p>{prompt.transcript}</p>
                </div>
              ) : (
                <div className="expected-transcript__locked">
                  <span className="expected-transcript__icon" aria-hidden>
                    <DoodleIcon name="doc" size={18} />
                  </span>
                  <div>
                    <strong>Transcription hidden</strong>
                    <p>Record your repetition first to reveal the original wording.</p>
                  </div>
                  <button
                    type="button"
                    className="button button--quiet expected-transcript__show"
                    onClick={() => {
                      setRevealedPromptIds((current) => new Set([...current, prompt.id]));
                      onNotice("Expected transcription shown.");
                    }}
                  >
                    Show transcription
                  </button>
                </div>
              )}
            </div>
            <p className="step-status" role="status" aria-live="polite">
              {playing
                ? "Prompt playing. Pause when you need to."
                : hasListened
                  ? "Prompt heard. You can record your response."
                  : "Play the full prompt before recording."}
            </p>
          </section>

          <section
            className="panel repeat-recorder"
            data-step-state={stepStates[1]}
            aria-busy={
              recorder.phase === "requesting" ||
              recorder.phase === "preparing" ||
              recorder.phase === "recording" ||
              recorder.phase === "saving"
            }
          >
            <header>
              <div>
                <p className="step-eyebrow">Step 2</p>
                <h2>Record your response</h2>
              </div>
              <small>{responseSeconds}-second response, no preparation time.</small>
            </header>
            <div className="repeat-recorder__stage">
              <span className="repeat-recorder__mic">
                <DoodleIcon name="mic" size={24} />
              </span>
              <div>
                <strong role="status" aria-live="polite">
                  {!hasListened ? "Listen to the prompt first" : recorder.statusMessage}
                </strong>
                {recorder.phase === "recording" ? (
                  <AudioWaveform analyserRef={recorder.analyserRef} active />
                ) : (
                  <span className="idle-wave" aria-hidden />
                )}
              </div>
              <time>00:{String(recorder.secondsLeft).padStart(2, "0")} remaining</time>
            </div>
            <div className="repeat-recorder__actions">
              {recorder.phase === "recording" ? (
                <button
                  type="button"
                  className="button button--danger"
                  disabled={recorder.isStopping}
                  onClick={recorder.stop}
                >
                  {recorder.isStopping ? "Finishing…" : "Stop recording"}
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() =>
                    void (recorder.phase === "failed" ? recorder.retry() : recorder.start())
                  }
                  disabled={!recorder.isSupported || !recordEnabled}
                  title={!hasListened ? "Listen to the prompt first" : undefined}
                >
                  <DoodleIcon name="record" size={17} />
                  {recorder.phase === "failed" ? "Try again" : "Record response"}
                </button>
              )}
              {recorder.result ? (
                <>
                  <audio controls src={recorder.result.url} aria-label="Your repetition playback">
                    <track kind="captions" />
                  </audio>
                  <button
                    type="button"
                    className="button button--quiet"
                    disabled={recorder.pendingAction !== null}
                    onClick={() => {
                      setHasCompared(false);
                      void recorder.recordAgain();
                    }}
                  >
                    Retry
                  </button>
                </>
              ) : null}
            </div>
            {recorder.error ? (
              <p className="inline-error" role="alert">
                {recorder.error}
              </p>
            ) : null}
          </section>

          <div className="repeat-results">
            <section className="panel transcript-result" data-step-state={stepStates[2]}>
              <header>
                <div>
                  <p className="step-eyebrow">Step 3</p>
                  <h2>Your transcription</h2>
                </div>
                <span>{countWords(transcript)} words</span>
              </header>
              <label htmlFor={`repeat-transcript-${prompt.id}`}>Recognized response</label>
              <textarea
                id={`repeat-transcript-${prompt.id}`}
                value={
                  recorder.phase === "recording" || recorder.phase === "preparing"
                    ? recorder.transcript
                    : editedTranscript
                }
                onChange={(event) => {
                  setEditedTranscript(event.target.value);
                  setHasCompared(false);
                }}
                disabled={!recorder.result}
                placeholder="Your transcribed response will appear here…"
              />
              <small>You can correct recognition errors before comparing.</small>
              <button
                type="button"
                className="button button--outline compare-button"
                disabled={!compareEnabled}
                onClick={() => setHasCompared(true)}
              >
                <DoodleIcon name="analytics" size={17} />
                {hasCompared ? "Compare again" : "Compare transcripts"}
              </button>
            </section>

            <section
              className="panel comparison-result"
              data-step-state={stepStates[3]}
              aria-live="polite"
            >
              <header>
                <div>
                  <p className="step-eyebrow">Step 4</p>
                  <h2>Comparison & feedback</h2>
                </div>
                {accuracy !== null ? (
                  <span data-score={accuracy >= 80 ? "good" : "practice"}>
                    {accuracy >= 80 ? "Good match" : "Keep practicing"}
                  </span>
                ) : null}
              </header>
              {accuracy !== null ? (
                <>
                  <div className="accuracy-row">
                    <span>Transcript match</span>
                    <i
                      role="progressbar"
                      aria-label="Transcript match"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={accuracy}
                    >
                      <b style={{ width: `${accuracy}%` }} />
                    </i>
                    <strong>{accuracy}%</strong>
                  </div>
                  {estimatedBand !== null ? (
                    <div className="listen-repeat-band">
                      <div>
                        <span>Estimated content band</span>
                        <strong>{estimatedBand}/5</strong>
                      </div>
                      <p>{LISTEN_REPEAT_BAND_DESCRIPTIONS[estimatedBand]}</p>
                      <small>
                        Transcript-based estimate only. Review your recording for pronunciation and
                        intelligibility, which are also part of the ETS rubric.
                      </small>
                    </div>
                  ) : null}
                  <div className="word-difference-groups">
                    <WordDifferenceGroup label="Missing words" words={differences.missing} />
                    <WordDifferenceGroup label="Extra words" words={differences.extra} />
                    <WordDifferenceGroup label="Changed words" words={differences.changed} />
                  </div>
                  <p className="comparison-feedback">
                    {accuracy >= 90
                      ? "Excellent. Your wording is very close to the original."
                      : accuracy >= 70
                        ? "Good work. Replay once and refine the highlighted differences."
                        : "Listen again, then repeat in shorter phrase groups."}
                  </p>
                </>
              ) : (
                <div className="comparison-placeholder">
                  <DoodleIcon name="analytics" size={28} />
                  <h3>Your comparison will appear here</h3>
                  <p>Record a response, review the transcript, then choose Compare transcripts.</p>
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="listen-repeat-footer">
          <button
            type="button"
            className="button button--outline"
            disabled={
              !recorder.result ||
              !hasCompared ||
              recorder.phase === "saving" ||
              recorder.phase === "saved"
            }
            onClick={() => void recorder.save()}
          >
            <DoodleIcon name="floppy" size={17} />
            {recorder.phase === "saving"
              ? "Saving…"
              : recorder.phase === "saved"
                ? "Attempt saved"
                : "Save attempt"}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!hasCompared}
            onClick={() => requestNavigation(nextCollectionIndex, nextPromptIndex)}
          >
            {continueLabel}
            <span aria-hidden>→</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

function WordDifferenceGroup({
  label,
  words,
}: {
  label: string;
  words: string[];
}): React.JSX.Element {
  return (
    <div className="word-difference-group">
      <strong>{label}</strong>
      <div>
        {words.length ? (
          summarizeWords(words).map((item) => <span key={item.key}>{item.label}</span>)
        ) : (
          <span className="word-difference-group__empty">None</span>
        )}
      </div>
    </div>
  );
}
