import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_VOCABULARY_SETTINGS } from "../types/vocabulary";
import {
  LEARNING_STORAGE_KEYS,
  learningRepository,
  parseLearningPortableState,
} from "./learningRepository";
import {
  createAppBackup,
  parseAppBackup,
  restoreAppBackup,
  serializeAppBackup,
  suggestedBackupFileName,
} from "./appBackup";
import { UnsupportedSchemaVersionError, InvalidBackupError } from "./storage";
import {
  VOCABULARY_STORAGE_KEY,
  parseVocabularyPortableState,
  vocabularyRepository,
} from "./vocabularyRepository";

const EXPORTED_AT = "2026-07-26T12:00:00.000Z";

const LEGACY_HISTORY = Object.freeze([
  Object.freeze({
    id: "attempt-legacy",
    topicId: 3,
    questionIndex: 1,
    createdAt: "2026-07-25T09:30:00.000Z",
    durationSeconds: 44.6,
    wordCount: 87,
    promptSnapshot: "Describe a useful public place.",
    notes: "Use a clearer transition.",
    recordingAvailable: true,
    recordingId: "recording-legacy",
    mimeType: "audio/webm",
    size: 12_345,
  }),
]);

const LEGACY_VOCABULARY = Object.freeze({
  settings: Object.freeze({
    reminderIntervalMinutes: 30,
    notificationMode: "popup",
    globalHotkeyEnabled: false,
    defaultSessionSize: 12,
  }),
  progress: Object.freeze({
    "personal-persist": Object.freeze({
      wordId: "personal-persist",
      timesSeen: 2,
      timesKnown: 1,
      timesLater: 1,
      timesSkipped: 0,
      lastReviewedAt: "2026-07-25T10:00:00.000Z",
      dueAt: "2026-07-26T10:00:00.000Z",
      stabilityDays: 1.5,
      memoryDifficulty: 6,
      lapses: 1,
      consecutiveCorrect: 0,
      lastResponseSeconds: 4.5,
    }),
  }),
  events: Object.freeze([
    Object.freeze({
      id: "review-legacy",
      timestamp: "2026-07-25T10:00:00.000Z",
      wordListId: "personal-words",
      wordId: "personal-persist",
      term: "Persist",
      action: "later",
      responseSeconds: 4.5,
    }),
  ]),
  personalWords: Object.freeze([
    Object.freeze({
      id: "personal-persist",
      term: "Persist",
      partOfSpeech: "verb",
      pronunciation: null,
      shortMeaning: "Continue despite difficulty",
      chapter: null,
      order: 1,
      tags: Object.freeze(["Personal"]),
      exampleSentences: Object.freeze(["Good habits persist."]),
      synonyms: Object.freeze(["continue"]),
      antonyms: Object.freeze([]),
      notes: "From a speaking response",
      difficulty: 4,
      enrichmentSource: null,
    }),
  ]),
  importedLists: Object.freeze([]),
  enabledLists: Object.freeze({
    "toefl-550-march-2026": true,
    "personal-words": true,
  }),
  pausedUntil: null,
  nextReminderAt: null,
});

const LEGACY_KEY_FIXTURES = Object.freeze({
  [LEARNING_STORAGE_KEYS.saved]: Object.freeze(["3-2", "1-1", "3-2"]),
  [LEARNING_STORAGE_KEYS.collapsed]: Object.freeze(["Campus Life", "Campus Life"]),
  [LEARNING_STORAGE_KEYS.targets]: Object.freeze({
    "3-2": Object.freeze(["For example", "As a result"]),
  }),
  [LEARNING_STORAGE_KEYS.history]: LEGACY_HISTORY,
  [VOCABULARY_STORAGE_KEY]: LEGACY_VOCABULARY,
});

function loadLegacyFixtures(): void {
  for (const [key, value] of Object.entries(LEGACY_KEY_FIXTURES)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

beforeEach(() => {
  localStorage.clear();
  loadLegacyFixtures();
});

describe("schema validation", () => {
  it("rejects future speaking data without normalizing it as current", () => {
    expect(() =>
      parseLearningPortableState({
        schemaVersion: 2,
        savedKeys: [],
        collapsedCategories: [],
        targetPhrases: {},
        history: [],
      }),
    ).toThrow(UnsupportedSchemaVersionError);
  });

  it("rejects future vocabulary and full-backup schemas", () => {
    expect(() => parseVocabularyPortableState({ schemaVersion: 2 })).toThrow(
      UnsupportedSchemaVersionError,
    );
    expect(() =>
      parseAppBackup({
        schemaVersion: 2,
        product: "toefl-companion",
        exportedAt: EXPORTED_AT,
      }),
    ).toThrow(UnsupportedSchemaVersionError);
  });

  it("rejects malformed current backups before any storage write", () => {
    const before = Object.fromEntries(
      Object.keys(LEGACY_KEY_FIXTURES).map((key) => [key, localStorage.getItem(key)]),
    );

    expect(() =>
      restoreAppBackup({
        schemaVersion: 1,
        product: "toefl-companion",
        exportedAt: EXPORTED_AT,
        speaking: {
          schemaVersion: 1,
          savedKeys: ["not-a-question"],
          collapsedCategories: [],
          targetPhrases: {},
          history: [],
        },
        vocabulary: {},
      }),
    ).toThrow(InvalidBackupError);

    expect(
      Object.fromEntries(
        Object.keys(LEGACY_KEY_FIXTURES).map((key) => [key, localStorage.getItem(key)]),
      ),
    ).toEqual(before);
  });
});

describe("full app backup", () => {
  it("migrates frozen legacy-key fixtures and round-trips all portable data", () => {
    const backup = createAppBackup(EXPORTED_AT);

    expect(backup).toMatchObject({
      schemaVersion: 1,
      product: "toefl-companion",
      exportedAt: EXPORTED_AT,
      speaking: {
        schemaVersion: 1,
        savedKeys: ["3-2", "1-1"],
        collapsedCategories: ["Campus Life"],
        targetPhrases: {
          "3-2": ["For example", "As a result"],
        },
      },
      vocabulary: {
        schemaVersion: 1,
        settings: {
          reminderIntervalMinutes: 30,
          reviewShortcutEnabled: false,
        },
      },
    });
    expect(backup.speaking.history).toHaveLength(1);
    // Audio blobs live in IndexedDB and are deliberately outside the portable
    // JSON format. The attempt metadata remains useful after import.
    expect(backup.speaking.history[0]).toMatchObject({
      id: "attempt-legacy",
      recordingAvailable: false,
    });
    expect(backup.speaking.history[0].recordingId).toBeUndefined();

    const serialized = serializeAppBackup(backup);
    localStorage.clear();
    const result = restoreAppBackup(serialized);

    expect(result).toMatchObject({
      sourceFormat: "full",
      savedQuestionCount: 2,
      speakingAttemptCount: 1,
      personalWordCount: 1,
      importedListCount: 0,
      vocabularyReviewCount: 1,
    });
    expect(learningRepository.getSavedKeys()).toEqual(["3-2", "1-1"]);
    expect(learningRepository.getHistory()[0]).toMatchObject({
      id: "attempt-legacy",
      recordingAvailable: false,
    });

    const vocabulary = vocabularyRepository.getPortableState();
    expect(vocabulary.personalWords).toHaveLength(1);
    expect(vocabulary.personalWords[0].term).toBe("Persist");
    expect(vocabulary.events).toHaveLength(1);
    expect(vocabulary.progress["personal-persist"]).toMatchObject({
      timesSeen: 2,
      lapses: 1,
    });
    expect(vocabulary.settings.reminderIntervalMinutes).toBe(30);
    expect(vocabulary.settings.defaultSessionSize).toBe(12);
  });

  it("migrates the old vocabulary-only backup without replacing speaking data", () => {
    const vocabulary = vocabularyRepository.getPortableState();
    const legacyBackup = {
      schemaVersion: 1,
      product: "toefl-companion",
      exportedAt: EXPORTED_AT,
      vocabulary,
    };

    const result = restoreAppBackup(legacyBackup);

    expect(result.sourceFormat).toBe("legacy-vocabulary-only");
    expect(result.backup.speaking.savedKeys).toEqual(["3-2", "1-1"]);
    expect(learningRepository.getHistory()).toHaveLength(1);
  });

  it("uses safe defaults when legacy settings omit newer preferences", () => {
    const vocabulary = vocabularyRepository.getPortableState();

    expect(vocabulary.settings.dailyReviewGoal).toBe(DEFAULT_VOCABULARY_SETTINGS.dailyReviewGoal);
    expect(vocabulary.settings.lastSessionFocusMode).toBe(true);
  });

  it("produces a deterministic, Windows-safe suggested filename", () => {
    expect(suggestedBackupFileName(new Date("2026-07-26T23:30:00.000Z"))).toBe(
      "toefl-companion-backup-2026-07-26.json",
    );
  });
});
