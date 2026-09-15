export type NotificationMode = "popup" | "system" | "toast" | "both" | "off";

export type ReviewAction = "known" | "later" | "skipped";

export type ReviewSelectionMode = "dueFirst" | "random";

export type MistakeUrgency = "low" | "medium" | "high";

export interface WordEntry {
  id: string;
  term: string;
  partOfSpeech: string | null;
  pronunciation: string | null;
  shortMeaning: string | null;
  chapter: number | null;
  order: number | null;
  tags: string[];
  exampleSentences: string[];
  /** Common TOEFL-ready word partnerships, kept separate from free-form notes. */
  collocations?: string[];
  synonyms: string[];
  antonyms: string[];
  notes: string | null;
  difficulty: number;
  enrichmentSource: string | null;
}

/** The seven flat colours of the interface, in the order new collections take them. */
export type CollectionColor = "mint" | "sky" | "grape" | "rose" | "sun" | "lime" | "flame";

export interface WordList {
  schemaVersion: 1;
  id: string;
  title: string;
  language: string | null;
  source: string | null;
  words: WordEntry[];
  isEnabled: boolean;
  isBuiltIn: boolean;
  /** Assigned by the repository when it builds a snapshot; never read from a file. */
  color?: CollectionColor;
}

export interface ReviewProgressEntry {
  wordId: string;
  timesSeen: number;
  timesKnown: number;
  timesLater: number;
  timesSkipped: number;
  lastReviewedAt: string | null;
  dueAt: string;
  stabilityDays: number;
  memoryDifficulty: number;
  lapses: number;
  consecutiveCorrect: number;
  lastResponseSeconds: number;
}

export type ReviewProgress = Record<string, ReviewProgressEntry>;

export interface ReviewEvent {
  id: string;
  timestamp: string;
  wordListId: string;
  wordId: string;
  term: string;
  action: ReviewAction;
  responseSeconds: number;
}

export interface ReviewSessionOptions {
  goal: number;
  wordListId: string | null;
  difficultOnly: boolean;
  timed: boolean;
  focusMode: boolean;
  includedWordIds: string[] | null;
}

export interface VocabularySettings {
  reminderIntervalMinutes: number;
  notificationMode: NotificationMode;
  popupDurationSeconds: number;
  quietHoursEnabled: boolean;
  /** Local wall-clock time in 24-hour `HH:mm` form. */
  quietHoursStart: string;
  /** Local wall-clock time in 24-hour `HH:mm` form. */
  quietHoursEnd: string;
  startWithSystem: boolean;
  selectionMode: ReviewSelectionMode;
  globalHotkeyEnabled: boolean;
  reviewShortcutEnabled: boolean;
  clipboardQuickAddEnabled: boolean;
  dictionaryLookupEnabled: boolean;
  soundEnabled: boolean;
  compactNotificationsWhenFullscreen: boolean;
  voiceName: string | null;
  speechRate: number;
  defaultSessionSize: number;
  dailyReviewGoal: number;
  lastSessionGoal: number;
  lastSessionWordListId: string | null;
  lastSessionDifficultOnly: boolean;
  lastSessionTimed: boolean;
  lastSessionFocusMode: boolean;
  lastVocabularyRoute: string;
  popupLeft: number | null;
  popupTop: number | null;
}

export interface VocabularyState {
  settings: VocabularySettings;
  wordLists: WordList[];
  progress: ReviewProgress;
  reviewEvents: ReviewEvent[];
  pausedUntil: string | null;
}

export interface MasterySummary {
  new: number;
  learning: number;
  familiar: number;
  mastered: number;
}

export interface VocabularyStats extends MasterySummary {
  totalWords: number;
  reviewedWords: number;
  dueNow: number;
  difficultWords: number;
  totalReviews: number;
  knownReviews: number;
  laterReviews: number;
  skippedReviews: number;
  recallRate: number;
  averageResponseSeconds: number;
  reviewedToday: number;
  dailyReviewGoal: number;
  dailyGoalProgress: number;
  reviewStreakDays: number;
  activeDays: number;
}

export interface MistakeCandidate {
  word: WordEntry;
  misses: number;
  lapses: number;
  memoryDifficulty: number;
  dueAt: string;
  lastReviewedAt: string | null;
  urgency: MistakeUrgency;
  reason: string;
}

export interface SessionPlan {
  options: ReviewSessionOptions;
  eligibleCount: number;
  dueCount: number;
  newCount: number;
  difficultCount: number;
  estimatedMinutes: number;
  reason: string;
  eligibleWordIds: string[];
  hasEligibleWords: boolean;
}

export const DEFAULT_VOCABULARY_SETTINGS: Readonly<VocabularySettings> = Object.freeze({
  reminderIntervalMinutes: 60,
  notificationMode: "both",
  popupDurationSeconds: 18,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  startWithSystem: false,
  selectionMode: "dueFirst",
  globalHotkeyEnabled: true,
  reviewShortcutEnabled: true,
  clipboardQuickAddEnabled: false,
  dictionaryLookupEnabled: true,
  soundEnabled: false,
  compactNotificationsWhenFullscreen: true,
  voiceName: null,
  speechRate: 1,
  defaultSessionSize: 20,
  dailyReviewGoal: 20,
  lastSessionGoal: 20,
  lastSessionWordListId: null,
  lastSessionDifficultOnly: false,
  lastSessionTimed: false,
  lastSessionFocusMode: true,
  lastVocabularyRoute: "/vocabulary/review",
  popupLeft: null,
  popupTop: null,
});

declare global {
  interface NotificationOptions {
    /** Supported by Chromium even when an older TypeScript DOM lib omits it. */
    renotify?: boolean;
  }
}
