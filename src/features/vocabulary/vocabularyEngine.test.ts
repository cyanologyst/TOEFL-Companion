import { describe, expect, it } from "vitest";
import type {
  ReviewProgress,
  ReviewProgressEntry,
  ReviewSessionOptions,
  WordEntry,
  WordList,
} from "../../types/vocabulary";
import { DEFAULT_VOCABULARY_SETTINGS } from "../../types/vocabulary";
import {
  calculateVocabularyStats,
  createSessionPlan,
  filterWordListsForSession,
  normalizeVocabularySettings,
} from "./vocabularyEngine";

const NOW = "2026-07-26T12:00:00.000Z";

function word(id: string, term = id): WordEntry {
  return {
    id,
    term,
    partOfSpeech: null,
    pronunciation: null,
    shortMeaning: null,
    chapter: null,
    order: null,
    tags: [],
    exampleSentences: [],
    synonyms: [],
    antonyms: [],
    notes: null,
    difficulty: 3,
    enrichmentSource: null,
  };
}

function list(id: string, words: WordEntry[], isEnabled = true): WordList {
  return {
    schemaVersion: 1,
    id,
    title: id,
    language: "en",
    source: null,
    words,
    isEnabled,
    isBuiltIn: false,
  };
}

function progress(
  wordId: string,
  overrides: Partial<ReviewProgressEntry> = {},
): ReviewProgressEntry {
  return {
    wordId,
    timesSeen: 1,
    timesKnown: 1,
    timesLater: 0,
    timesSkipped: 0,
    lastReviewedAt: "2026-07-25T12:00:00.000Z",
    dueAt: "2026-07-26T11:00:00.000Z",
    stabilityDays: 1,
    memoryDifficulty: 5,
    lapses: 0,
    consecutiveCorrect: 1,
    lastResponseSeconds: 3,
    ...overrides,
  };
}

describe("calculateVocabularyStats", () => {
  it("keeps new words separate from reviewed words that are due", () => {
    const lists = [
      list("main", [word("unseen"), word("snoozed-new"), word("due"), word("future")]),
    ];
    const reviewProgress: ReviewProgress = {
      "snoozed-new": progress("snoozed-new", {
        timesSeen: 0,
        timesKnown: 0,
        lastReviewedAt: null,
        dueAt: "2026-07-26T13:00:00.000Z",
      }),
      due: progress("due"),
      future: progress("future", {
        dueAt: "2026-07-27T12:00:00.000Z",
      }),
    };

    const stats = calculateVocabularyStats(lists, reviewProgress, [], NOW);

    expect(stats.totalWords).toBe(4);
    expect(stats.new).toBe(2);
    expect(stats.dueNow).toBe(1);
    expect(stats.new + stats.dueNow).toBeLessThanOrEqual(stats.totalWords);
  });

  it("uses no review events as a no-data state rather than fake activity", () => {
    const stats = calculateVocabularyStats([list("main", [word("one")])], {}, [], NOW);

    expect(stats.totalReviews).toBe(0);
    expect(stats.knownReviews).toBe(0);
    expect(stats.reviewedToday).toBe(0);
    expect(stats.reviewStreakDays).toBe(0);
  });
});

describe("createSessionPlan", () => {
  const due = word("due");
  const difficult = word("difficult");
  const fresh = word("fresh");
  const freshSecond = word("fresh-second");
  const future = word("future");
  const lists = [
    list("first", [fresh, due, difficult, future]),
    list("second", [due, freshSecond]),
    list("disabled", [word("disabled")], false),
  ];
  const reviewProgress: ReviewProgress = {
    due: progress("due"),
    difficult: progress("difficult", {
      lapses: 2,
      memoryDifficulty: 8,
    }),
    future: progress("future", {
      dueAt: "2026-08-01T12:00:00.000Z",
    }),
  };

  it("deduplicates IDs, excludes disabled lists, and reports useful counts", () => {
    const plan = createSessionPlan(lists, reviewProgress, NOW, 99);

    expect(plan.eligibleWordIds).toEqual(["fresh", "due", "difficult", "future", "fresh-second"]);
    expect(plan.eligibleCount).toBe(5);
    expect(plan.options.goal).toBe(5);
    expect(plan.newCount).toBe(2);
    expect(plan.dueCount).toBe(2);
    expect(plan.difficultCount).toBe(1);
    expect(plan.hasEligibleWords).toBe(true);
  });

  it("limits the plan to the requested list", () => {
    const plan = createSessionPlan(lists, reviewProgress, NOW, 20, "SECOND");

    expect(plan.eligibleWordIds).toEqual(["due", "fresh-second"]);
    expect(plan.eligibleCount).toBe(2);
    expect(plan.newCount).toBe(1);
    expect(plan.dueCount).toBe(1);
  });

  it("uses only difficult words when that preference is enabled", () => {
    const plan = createSessionPlan(lists, reviewProgress, NOW, 20, null, true);

    expect(plan.eligibleWordIds).toEqual(["difficult"]);
    expect(plan.eligibleCount).toBe(1);
    expect(plan.options.goal).toBe(1);
    expect(plan.hasEligibleWords).toBe(true);
  });
});

describe("filterWordListsForSession", () => {
  const hard = word("hard");
  const easy = word("easy");
  const duplicatedHard = { ...hard, term: "Hard duplicate" };
  const lists = [list("alpha", [hard, easy]), list("beta", [duplicatedHard, word("other")])];
  const reviewProgress: ReviewProgress = {
    hard: progress("hard", { lapses: 1 }),
    easy: progress("easy"),
  };

  it("applies list, included, excluded, and difficult filters", () => {
    const options: ReviewSessionOptions = {
      goal: 10,
      wordListId: "ALPHA",
      difficultOnly: true,
      timed: false,
      focusMode: true,
      includedWordIds: ["HARD", "easy"],
    };

    const filtered = filterWordListsForSession(lists, reviewProgress, options, new Set(["EASY"]));

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("alpha");
    expect(filtered[0].words.map(({ id }) => id)).toEqual(["hard"]);
  });

  it("does not mutate source lists while filtering", () => {
    const options: ReviewSessionOptions = {
      goal: 10,
      wordListId: null,
      difficultOnly: false,
      timed: false,
      focusMode: true,
      includedWordIds: ["hard"],
    };
    const before = lists.map((entry) => entry.words.length);

    filterWordListsForSession(lists, reviewProgress, options);

    expect(lists.map((entry) => entry.words.length)).toEqual(before);
  });
});

describe("review preference defaults", () => {
  it("uses the shipped reminder and review defaults for missing data", () => {
    const normalized = normalizeVocabularySettings({});

    expect(normalized).toEqual(DEFAULT_VOCABULARY_SETTINGS);
    expect(normalized.reminderIntervalMinutes).toBe(60);
    expect(normalized.defaultSessionSize).toBe(20);
    expect(normalized.lastSessionGoal).toBe(20);
    expect(normalized.lastSessionWordListId).toBeNull();
    expect(normalized.lastSessionDifficultOnly).toBe(false);
    expect(normalized.lastSessionTimed).toBe(false);
    expect(normalized.lastSessionFocusMode).toBe(true);
  });

  it("clamps unsafe saved preferences and migrates the old hotkey flag", () => {
    const normalized = normalizeVocabularySettings({
      reminderIntervalMinutes: 0,
      defaultSessionSize: 500,
      lastSessionGoal: Number.NaN,
      globalHotkeyEnabled: false,
      reviewShortcutEnabled: undefined as unknown as boolean,
      lastVocabularyRoute: "/unknown",
    });

    expect(normalized.reminderIntervalMinutes).toBe(1);
    expect(normalized.defaultSessionSize).toBe(100);
    expect(normalized.lastSessionGoal).toBe(20);
    expect(normalized.reviewShortcutEnabled).toBe(false);
    expect(normalized.globalHotkeyEnabled).toBe(false);
    expect(normalized.lastVocabularyRoute).toBe(DEFAULT_VOCABULARY_SETTINGS.lastVocabularyRoute);
  });
});
