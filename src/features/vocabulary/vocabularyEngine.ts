import type {
  MasterySummary,
  MistakeCandidate,
  MistakeUrgency,
  NotificationMode,
  ReviewAction,
  ReviewEvent,
  ReviewProgress,
  ReviewProgressEntry,
  ReviewSelectionMode,
  ReviewSessionOptions,
  SessionPlan,
  VocabularySettings,
  VocabularyState,
  VocabularyStats,
  WordEntry,
  WordList,
} from "../../types/vocabulary";
import { DEFAULT_VOCABULARY_SETTINGS } from "../../types/vocabulary";

const MINIMUM_ISO_TIMESTAMP = "0001-01-01T00:00:00.000Z";
const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const notificationModes = new Set<NotificationMode>(["popup", "system", "toast", "both", "off"]);
const selectionModes = new Set<ReviewSelectionMode>(["dueFirst", "random"]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.round(clamp(finiteNumber(value, fallback), minimum, maximum));
}

function validIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function requireIsoDate(value: string, fallback = new Date(0)): Date {
  return validIsoDate(value) ?? fallback;
}

function normalizeClockTime(value: unknown, fallback: string): string {
  return typeof value === "string" && CLOCK_PATTERN.test(value) ? value : fallback;
}

function clockMinutes(value: string): number {
  const match = CLOCK_PATTERN.exec(value);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function localClockMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function setLocalClock(date: Date, minutes: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );
}

function normalizedRandomIndex(length: number, random: () => number): number {
  if (length <= 1) {
    return 0;
  }
  const sample = finiteNumber(random(), 0);
  return Math.min(length - 1, Math.floor(clamp(sample, 0, 1) * length));
}

function normalizeProgressEntry(
  entry: ReviewProgressEntry | undefined,
  wordId: string,
): ReviewProgressEntry {
  return {
    wordId,
    timesSeen: clampedInteger(entry?.timesSeen, 0, Number.MAX_SAFE_INTEGER, 0),
    timesKnown: clampedInteger(entry?.timesKnown, 0, Number.MAX_SAFE_INTEGER, 0),
    timesLater: clampedInteger(entry?.timesLater, 0, Number.MAX_SAFE_INTEGER, 0),
    timesSkipped: clampedInteger(entry?.timesSkipped, 0, Number.MAX_SAFE_INTEGER, 0),
    lastReviewedAt: validIsoDate(entry?.lastReviewedAt) ? entry!.lastReviewedAt : null,
    dueAt: validIsoDate(entry?.dueAt)?.toISOString() ?? MINIMUM_ISO_TIMESTAMP,
    stabilityDays: clamp(finiteNumber(entry?.stabilityDays, 1), 0.25, 365),
    memoryDifficulty: clamp(finiteNumber(entry?.memoryDifficulty, 5), 1, 10),
    lapses: clampedInteger(entry?.lapses, 0, Number.MAX_SAFE_INTEGER, 0),
    consecutiveCorrect: clampedInteger(entry?.consecutiveCorrect, 0, Number.MAX_SAFE_INTEGER, 0),
    lastResponseSeconds: Math.max(0, finiteNumber(entry?.lastResponseSeconds, 0)),
  };
}

function uniqueEnabledWords(wordLists: readonly WordList[]): WordEntry[] {
  const seen = new Set<string>();
  const words: WordEntry[] = [];
  for (const list of wordLists) {
    if (!list.isEnabled) {
      continue;
    }
    for (const word of list.words) {
      const id = word.id.trim().toLocaleLowerCase();
      if (!id || !word.term.trim() || seen.has(id)) {
        continue;
      }
      seen.add(id);
      words.push(word);
    }
  }
  return words;
}

function isDifficult(word: WordEntry, progress: Readonly<ReviewProgress>): boolean {
  const entry = progress[word.id];
  return Boolean(
    entry &&
      (entry.lapses > 0 ||
        entry.timesLater + entry.timesSkipped >= 2 ||
        entry.memoryDifficulty >= 6),
  );
}

function localDateKey(date: Date, timeZone?: string): string {
  if (!timeZone) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return localDateKey(date);
  }
}

export function normalizeVocabularySettings(
  candidate: Partial<VocabularySettings> | null | undefined,
): VocabularySettings {
  const source = candidate ?? {};
  const reviewShortcutEnabled =
    typeof source.reviewShortcutEnabled === "boolean"
      ? source.reviewShortcutEnabled
      : typeof source.globalHotkeyEnabled === "boolean"
        ? source.globalHotkeyEnabled
        : DEFAULT_VOCABULARY_SETTINGS.reviewShortcutEnabled;
  const notificationMode = notificationModes.has(source.notificationMode as NotificationMode)
    ? (source.notificationMode as NotificationMode)
    : DEFAULT_VOCABULARY_SETTINGS.notificationMode;
  const selectionMode = selectionModes.has(source.selectionMode as ReviewSelectionMode)
    ? (source.selectionMode as ReviewSelectionMode)
    : DEFAULT_VOCABULARY_SETTINGS.selectionMode;

  return {
    reminderIntervalMinutes: clampedInteger(
      source.reminderIntervalMinutes,
      1,
      180,
      DEFAULT_VOCABULARY_SETTINGS.reminderIntervalMinutes,
    ),
    notificationMode,
    popupDurationSeconds: clampedInteger(
      source.popupDurationSeconds,
      5,
      120,
      DEFAULT_VOCABULARY_SETTINGS.popupDurationSeconds,
    ),
    quietHoursEnabled:
      typeof source.quietHoursEnabled === "boolean"
        ? source.quietHoursEnabled
        : DEFAULT_VOCABULARY_SETTINGS.quietHoursEnabled,
    quietHoursStart: normalizeClockTime(
      source.quietHoursStart,
      DEFAULT_VOCABULARY_SETTINGS.quietHoursStart,
    ),
    quietHoursEnd: normalizeClockTime(
      source.quietHoursEnd,
      DEFAULT_VOCABULARY_SETTINGS.quietHoursEnd,
    ),
    startWithSystem:
      typeof source.startWithSystem === "boolean"
        ? source.startWithSystem
        : DEFAULT_VOCABULARY_SETTINGS.startWithSystem,
    selectionMode,
    globalHotkeyEnabled: reviewShortcutEnabled,
    reviewShortcutEnabled,
    clipboardQuickAddEnabled:
      typeof source.clipboardQuickAddEnabled === "boolean"
        ? source.clipboardQuickAddEnabled
        : DEFAULT_VOCABULARY_SETTINGS.clipboardQuickAddEnabled,
    dictionaryLookupEnabled:
      typeof source.dictionaryLookupEnabled === "boolean"
        ? source.dictionaryLookupEnabled
        : DEFAULT_VOCABULARY_SETTINGS.dictionaryLookupEnabled,
    soundEnabled:
      typeof source.soundEnabled === "boolean"
        ? source.soundEnabled
        : DEFAULT_VOCABULARY_SETTINGS.soundEnabled,
    compactNotificationsWhenFullscreen:
      typeof source.compactNotificationsWhenFullscreen === "boolean"
        ? source.compactNotificationsWhenFullscreen
        : DEFAULT_VOCABULARY_SETTINGS.compactNotificationsWhenFullscreen,
    voiceName:
      typeof source.voiceName === "string" && source.voiceName.trim()
        ? source.voiceName.trim()
        : null,
    speechRate: clamp(
      finiteNumber(source.speechRate, DEFAULT_VOCABULARY_SETTINGS.speechRate),
      0.5,
      2,
    ),
    defaultSessionSize: clampedInteger(
      source.defaultSessionSize,
      5,
      100,
      DEFAULT_VOCABULARY_SETTINGS.defaultSessionSize,
    ),
    dailyReviewGoal: clampedInteger(
      source.dailyReviewGoal,
      1,
      500,
      DEFAULT_VOCABULARY_SETTINGS.dailyReviewGoal,
    ),
    lastSessionGoal: clampedInteger(
      source.lastSessionGoal,
      1,
      100,
      DEFAULT_VOCABULARY_SETTINGS.lastSessionGoal,
    ),
    lastSessionWordListId:
      typeof source.lastSessionWordListId === "string" && source.lastSessionWordListId.trim()
        ? source.lastSessionWordListId.trim()
        : null,
    lastSessionDifficultOnly:
      typeof source.lastSessionDifficultOnly === "boolean"
        ? source.lastSessionDifficultOnly
        : DEFAULT_VOCABULARY_SETTINGS.lastSessionDifficultOnly,
    lastSessionTimed:
      typeof source.lastSessionTimed === "boolean"
        ? source.lastSessionTimed
        : DEFAULT_VOCABULARY_SETTINGS.lastSessionTimed,
    lastSessionFocusMode:
      typeof source.lastSessionFocusMode === "boolean"
        ? source.lastSessionFocusMode
        : DEFAULT_VOCABULARY_SETTINGS.lastSessionFocusMode,
    lastVocabularyRoute:
      typeof source.lastVocabularyRoute === "string" &&
      source.lastVocabularyRoute.startsWith("/vocabulary/")
        ? source.lastVocabularyRoute
        : DEFAULT_VOCABULARY_SETTINGS.lastVocabularyRoute,
    popupLeft:
      typeof source.popupLeft === "number" && Number.isFinite(source.popupLeft)
        ? source.popupLeft
        : null,
    popupTop:
      typeof source.popupTop === "number" && Number.isFinite(source.popupTop)
        ? source.popupTop
        : null,
  };
}

export function isQuietHours(
  settings: Pick<VocabularySettings, "quietHoursEnabled" | "quietHoursStart" | "quietHoursEnd">,
  nowIso: string,
): boolean {
  if (!settings.quietHoursEnabled) {
    return false;
  }

  const now = requireIsoDate(nowIso);
  const start = clockMinutes(normalizeClockTime(settings.quietHoursStart, "22:00"));
  const end = clockMinutes(normalizeClockTime(settings.quietHoursEnd, "07:00"));
  const current = localClockMinutes(now);

  if (start === end) {
    return true;
  }
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function getNextReminderAt(
  settingsInput: VocabularySettings,
  nowIso: string,
): string | null {
  const settings = normalizeVocabularySettings(settingsInput);
  if (settings.notificationMode === "off") {
    return null;
  }

  const now = requireIsoDate(nowIso);
  if (!isQuietHours(settings, now.toISOString())) {
    return new Date(
      now.getTime() + settings.reminderIntervalMinutes * MILLISECONDS_PER_MINUTE,
    ).toISOString();
  }

  const start = clockMinutes(settings.quietHoursStart);
  const end = clockMinutes(settings.quietHoursEnd);
  const current = localClockMinutes(now);
  const next = setLocalClock(now, end);
  if ((start > end && current >= start) || start === end || next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

export function pickNextWord(
  wordLists: readonly WordList[],
  progress: Readonly<ReviewProgress>,
  settingsInput: VocabularySettings,
  nowIso: string,
  random: () => number = Math.random,
): WordEntry | null {
  const settings = normalizeVocabularySettings(settingsInput);
  if (settings.notificationMode === "off" || isQuietHours(settings, nowIso)) {
    return null;
  }

  const words = uniqueEnabledWords(wordLists);
  if (!words.length) {
    return null;
  }
  if (settings.selectionMode === "random") {
    return words[normalizedRandomIndex(words.length, random)] ?? null;
  }

  const now = requireIsoDate(nowIso).getTime();
  const due = words
    .filter((word) => {
      const entry = progress[word.id];
      return !entry || requireIsoDate(entry.dueAt).getTime() <= now;
    })
    .sort((left, right) => {
      const leftProgress = progress[left.id];
      const rightProgress = progress[right.id];
      const dueDifference =
        (validIsoDate(leftProgress?.dueAt)?.getTime() ?? Number.NEGATIVE_INFINITY) -
        (validIsoDate(rightProgress?.dueAt)?.getTime() ?? Number.NEGATIVE_INFINITY);
      if (dueDifference !== 0) {
        return dueDifference;
      }
      const lapseDifference = (rightProgress?.lapses ?? 0) - (leftProgress?.lapses ?? 0);
      if (lapseDifference !== 0) {
        return lapseDifference;
      }
      const difficultyDifference =
        (rightProgress?.memoryDifficulty ?? 5) - (leftProgress?.memoryDifficulty ?? 5);
      if (difficultyDifference !== 0) {
        return difficultyDifference;
      }
      return (leftProgress?.timesSeen ?? 0) - (rightProgress?.timesSeen ?? 0);
    });

  return due[0] ?? words[normalizedRandomIndex(words.length, random)] ?? null;
}

export function applyReviewAction(
  current: ReviewProgressEntry | undefined,
  wordId: string,
  action: ReviewAction,
  nowIso: string,
  responseSeconds = 0,
): ReviewProgressEntry {
  const now = requireIsoDate(nowIso);
  const next = normalizeProgressEntry(current, wordId);
  const response = Math.max(0, finiteNumber(responseSeconds, 0));

  next.timesSeen += 1;
  next.lastReviewedAt = now.toISOString();
  next.lastResponseSeconds = response;

  if (action === "known") {
    next.timesKnown += 1;
    next.consecutiveCorrect += 1;
    next.memoryDifficulty = clamp(
      next.memoryDifficulty - (response > 0 && response < 4 ? 0.35 : 0.18),
      1,
      10,
    );
    const growth =
      1.65 + (10 - next.memoryDifficulty) * 0.08 + Math.min(0.5, next.consecutiveCorrect * 0.05);
    next.stabilityDays = clamp(next.stabilityDays * growth, 1, 365);
    const roundedStability = Math.round(next.stabilityDays * 10) / 10;
    next.dueAt = new Date(
      now.getTime() + Math.max(1, roundedStability) * MILLISECONDS_PER_DAY,
    ).toISOString();
  } else if (action === "later") {
    next.timesLater += 1;
    next.consecutiveCorrect = 0;
    next.memoryDifficulty = clamp(next.memoryDifficulty + 0.45, 1, 10);
    next.stabilityDays = Math.max(0.5, next.stabilityDays * 0.72);
    next.dueAt = new Date(now.getTime() + 10 * MILLISECONDS_PER_MINUTE).toISOString();
  } else {
    next.timesSkipped += 1;
    next.lapses += 1;
    next.consecutiveCorrect = 0;
    next.memoryDifficulty = clamp(next.memoryDifficulty + 0.7, 1, 10);
    next.stabilityDays = Math.max(0.25, next.stabilityDays * 0.45);
    next.dueAt = new Date(now.getTime() + 5 * MILLISECONDS_PER_MINUTE).toISOString();
  }

  return next;
}

export function recordReview(
  state: VocabularyState,
  wordListId: string,
  word: WordEntry,
  action: ReviewAction,
  nowIso: string,
  responseSeconds = 0,
  eventId = `${word.id}-${nowIso}`,
): VocabularyState {
  const timestamp = requireIsoDate(nowIso).toISOString();
  const response = Math.max(0, finiteNumber(responseSeconds, 0));
  const entry = applyReviewAction(state.progress[word.id], word.id, action, timestamp, response);
  const reviewEvent: ReviewEvent = {
    id: eventId,
    timestamp,
    wordListId,
    wordId: word.id,
    term: word.term,
    action,
    responseSeconds: response,
  };
  return {
    ...state,
    progress: { ...state.progress, [word.id]: entry },
    reviewEvents: [reviewEvent, ...state.reviewEvents],
  };
}

export function snoozeWord(
  progress: Readonly<ReviewProgress>,
  wordId: string,
  durationMinutes: number,
  nowIso: string,
): ReviewProgress {
  const now = requireIsoDate(nowIso);
  const minutes = clampedInteger(durationMinutes, 1, 10_080, 15);
  const entry = normalizeProgressEntry(progress[wordId], wordId);
  return {
    ...progress,
    [wordId]: {
      ...entry,
      dueAt: new Date(now.getTime() + minutes * MILLISECONDS_PER_MINUTE).toISOString(),
    },
  };
}

export function createSessionPlan(
  wordLists: readonly WordList[],
  progress: Readonly<ReviewProgress>,
  nowIso: string,
  requestedGoal: number,
  wordListId: string | null = null,
  difficultOnly = false,
): SessionPlan {
  const normalizedListId = wordListId?.trim().toLocaleLowerCase() ?? null;
  const seen = new Set<string>();
  const words = wordLists
    .filter(
      (list) =>
        list.isEnabled && (!normalizedListId || list.id.toLocaleLowerCase() === normalizedListId),
    )
    .flatMap((list) => list.words)
    .filter((word) => {
      const id = word.id.trim().toLocaleLowerCase();
      if (!id || !word.term.trim() || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });

  const now = requireIsoDate(nowIso).getTime();
  const newCount = words.filter(
    (word) => !progress[word.id] || progress[word.id].timesSeen === 0,
  ).length;
  const dueCount = words.filter((word) => {
    const entry = progress[word.id];
    return entry && entry.timesSeen > 0 && requireIsoDate(entry.dueAt).getTime() <= now;
  }).length;
  const difficultWords = words.filter((word) => isDifficult(word, progress));
  const eligibleWords = difficultOnly ? difficultWords : words;
  const eligibleCount = eligibleWords.length;
  const goal = eligibleCount
    ? Math.min(clampedInteger(requestedGoal, 1, 100, 20), eligibleCount)
    : 0;
  const estimatedMinutes = goal ? Math.max(1, Math.ceil((goal * 18) / 60)) : 0;
  const dueWordsInPlan = Math.min(dueCount, goal);
  const reason = !eligibleCount
    ? difficultOnly
      ? "No words currently meet the difficult-word criteria."
      : "No enabled words match this session."
    : dueCount > 0
      ? `Starts with ${dueWordsInPlan} due ${
          dueWordsInPlan === 1 ? "word" : "words"
        }, then fills the session with useful practice.`
      : newCount > 0
        ? "Introduces new words while keeping the session short enough to finish."
        : "Keeps familiar words active with a focused recall session.";
  const options: ReviewSessionOptions = {
    goal,
    wordListId,
    difficultOnly,
    timed: false,
    focusMode: true,
    includedWordIds: null,
  };

  return {
    options,
    eligibleCount,
    dueCount,
    newCount,
    difficultCount: difficultWords.length,
    estimatedMinutes,
    reason,
    eligibleWordIds: eligibleWords.map((word) => word.id),
    hasEligibleWords: eligibleCount > 0 && goal > 0,
  };
}

export function filterWordListsForSession(
  wordLists: readonly WordList[],
  progress: Readonly<ReviewProgress>,
  options: ReviewSessionOptions,
  excludedWordIds: ReadonlySet<string> = new Set<string>(),
): WordList[] {
  const included = options.includedWordIds
    ? new Set(options.includedWordIds.map((id) => id.toLocaleLowerCase()))
    : null;
  const excluded = new Set([...excludedWordIds].map((id) => id.toLocaleLowerCase()));
  const requestedListId = options.wordListId?.toLocaleLowerCase() ?? null;

  return wordLists
    .filter((list) => !requestedListId || list.id.toLocaleLowerCase() === requestedListId)
    .map((list) => ({
      ...list,
      words: list.words.filter((word) => {
        const id = word.id.toLocaleLowerCase();
        return (
          !excluded.has(id) &&
          (!included || included.has(id)) &&
          (!options.difficultOnly || isDifficult(word, progress))
        );
      }),
    }))
    .filter((list) => list.words.length > 0);
}

export function qualifyMistake(entry: ReviewProgressEntry): Omit<
  MistakeCandidate,
  "word" | "dueAt" | "lastReviewedAt" | "memoryDifficulty"
> & {
  qualifies: boolean;
} {
  const misses = entry.timesLater + entry.timesSkipped;
  const qualifies = entry.lapses > 0 || misses > 0;
  const urgency: MistakeUrgency =
    entry.lapses >= 3 || entry.memoryDifficulty >= 8
      ? "high"
      : misses >= 2 || entry.lapses >= 2
        ? "medium"
        : "low";
  const reason =
    entry.lapses >= 3
      ? "Repeated recall lapses"
      : entry.memoryDifficulty >= 8
        ? "High memory difficulty"
        : entry.timesSkipped >= 2
          ? "Skipped repeatedly"
          : entry.timesLater >= 2
            ? "Deferred repeatedly"
            : entry.lapses > 0
              ? "Recall lapse recorded"
              : misses > 0
                ? "Marked for another review"
                : "No difficulty signal";
  return { qualifies, misses, lapses: entry.lapses, urgency, reason };
}

export function getMistakeCandidates(
  wordLists: readonly WordList[],
  progress: Readonly<ReviewProgress>,
  limit = 100,
): MistakeCandidate[] {
  const words = new Map(uniqueEnabledWords(wordLists).map((word) => [word.id, word]));
  return Object.values(progress)
    .flatMap((entry) => {
      const word = words.get(entry.wordId);
      const qualification = qualifyMistake(entry);
      return word && qualification.qualifies
        ? [
            {
              word,
              misses: qualification.misses,
              lapses: qualification.lapses,
              memoryDifficulty: entry.memoryDifficulty,
              dueAt: validIsoDate(entry.dueAt)?.toISOString() ?? MINIMUM_ISO_TIMESTAMP,
              lastReviewedAt: validIsoDate(entry.lastReviewedAt)?.toISOString() ?? null,
              urgency: qualification.urgency,
              reason: qualification.reason,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        right.lapses - left.lapses ||
        right.misses - left.misses ||
        right.memoryDifficulty - left.memoryDifficulty ||
        left.word.term.localeCompare(right.word.term),
    )
    .slice(0, clampedInteger(limit, 0, 10_000, 100));
}

export function calculateMasterySummary(
  wordLists: readonly WordList[],
  progress: Readonly<ReviewProgress>,
): MasterySummary {
  const words = uniqueEnabledWords(wordLists);
  return {
    new: words.filter((word) => {
      const entry = progress[word.id];
      return !entry || entry.timesSeen === 0;
    }).length,
    learning: words.filter((word) => {
      const entry = progress[word.id];
      return entry && entry.timesSeen > 0 && entry.timesKnown < 2;
    }).length,
    familiar: words.filter((word) => {
      const entry = progress[word.id];
      return entry && entry.timesKnown >= 2 && entry.timesKnown < 5;
    }).length,
    mastered: words.filter((word) => {
      const entry = progress[word.id];
      return entry && entry.timesKnown >= 5;
    }).length,
  };
}

export function calculateVocabularyStats(
  wordLists: readonly WordList[],
  progress: Readonly<ReviewProgress>,
  reviewEvents: readonly ReviewEvent[],
  nowIso: string,
  dailyReviewGoal = DEFAULT_VOCABULARY_SETTINGS.dailyReviewGoal,
  timeZone?: string,
): VocabularyStats {
  const words = uniqueEnabledWords(wordLists);
  const mastery = calculateMasterySummary(wordLists, progress);
  const now = requireIsoDate(nowIso);
  const nowTime = now.getTime();
  const today = localDateKey(now, timeZone);
  const validEvents = reviewEvents.filter((event) => Boolean(validIsoDate(event.timestamp)));
  const dateKeys = new Set(
    validEvents.map((event) => localDateKey(requireIsoDate(event.timestamp), timeZone)),
  );
  let reviewStreakDays = 0;
  const visitedStreakDates = new Set<string>();
  for (let offset = 0; offset < 10_000; offset += 1) {
    const key = localDateKey(new Date(nowTime - offset * MILLISECONDS_PER_DAY), timeZone);
    if (visitedStreakDates.has(key)) {
      continue;
    }
    visitedStreakDates.add(key);
    if (!dateKeys.has(key)) {
      break;
    }
    reviewStreakDays += 1;
  }

  const knownReviews = validEvents.filter((event) => event.action === "known").length;
  const laterReviews = validEvents.filter((event) => event.action === "later").length;
  const skippedReviews = validEvents.filter((event) => event.action === "skipped").length;
  const totalReviews = validEvents.length;
  const reviewedToday = validEvents.filter(
    (event) => localDateKey(requireIsoDate(event.timestamp), timeZone) === today,
  ).length;
  const goal = clampedInteger(dailyReviewGoal, 1, 500, 20);

  return {
    ...mastery,
    totalWords: words.length,
    reviewedWords: words.filter((word) => Boolean(progress[word.id])).length,
    dueNow: words.filter((word) => {
      const entry = progress[word.id];
      return entry && entry.timesSeen > 0 && requireIsoDate(entry.dueAt).getTime() <= nowTime;
    }).length,
    difficultWords: words.filter((word) => isDifficult(word, progress)).length,
    totalReviews,
    knownReviews,
    laterReviews,
    skippedReviews,
    recallRate: totalReviews ? (knownReviews * 100) / totalReviews : 0,
    averageResponseSeconds: totalReviews
      ? validEvents.reduce(
          (total, event) => total + Math.max(0, finiteNumber(event.responseSeconds, 0)),
          0,
        ) / totalReviews
      : 0,
    reviewedToday,
    dailyReviewGoal: goal,
    dailyGoalProgress: Math.min(100, (reviewedToday * 100) / goal),
    reviewStreakDays,
    activeDays: dateKeys.size,
  };
}
