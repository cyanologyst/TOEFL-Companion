import rawBuiltInList from "../data/toefl-550.wordlist.json";
import rawNeoList from "../data/toefl-neo-1-10.wordlist.json";
import type {
  CollectionColor,
  ReviewAction,
  ReviewEvent,
  ReviewProgressEntry,
  VocabularySettings,
  WordEntry,
  WordList,
} from "../types/vocabulary";
import { DEFAULT_VOCABULARY_SETTINGS } from "../types/vocabulary";
import {
  InvalidBackupError,
  StorageParseError,
  UnsupportedSchemaVersionError,
  dispatchLocalChange,
  readJsonValue,
  writeJsonValue,
} from "./storage";

export const VOCABULARY_STORAGE_KEY = "toefl-companion:vocabulary:v1";
export const VOCABULARY_CHANGE_EVENT = "toefl-companion:vocabulary-change";
const VOCABULARY_SCHEMA_VERSION = 1;
const PERSONAL_LIST_ID = "personal-words";
const PERSONAL_LIST_TITLE = "Personal words";
const MAX_EVENTS = 10_000;

/** New collections take the first of these that no list is already wearing. */
const COLLECTION_COLORS: readonly CollectionColor[] = [
  "mint",
  "sky",
  "grape",
  "rose",
  "sun",
  "lime",
  "flame",
];
const DEFAULT_LIST_COLORS: Record<string, CollectionColor> = {
  "toefl-550-march-2026": "sun",
  "toefl-neo-1-10": "sky",
  [PERSONAL_LIST_ID]: "mint",
};

const CP_1252_REVERSE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

export interface VocabularyStore {
  schemaVersion: 1;
  settings: VocabularySettings;
  progress: Record<string, ReviewProgressEntry>;
  events: ReviewEvent[];
  personalWords: WordEntry[];
  importedLists: WordList[];
  enabledLists: Record<string, boolean>;
  /** Colour chosen per list id. Lists without one fall back to a fixed colour. */
  collectionColors: Record<string, CollectionColor>;
  /** Personal words renamed by the learner; null keeps the default name. */
  personalListTitle: string | null;
  pausedUntil: string | null;
  nextReminderAt: string | null;
}

export interface VocabularySnapshot extends VocabularyStore {
  wordLists: WordList[];
}

export interface WordLocation {
  word: WordEntry;
  list: WordList;
}

export interface PersonalWordDraft {
  term: string;
  partOfSpeech?: string;
  pronunciation?: string;
  shortMeaning?: string;
  exampleSentence?: string;
  collocations?: string[];
  notes?: string;
}

export interface ImportResult {
  list: WordList;
  warnings: string[];
  skippedDuplicates: number;
}

export interface VocabularyBackup {
  schemaVersion: 1;
  product: "toefl-companion";
  exportedAt: string;
  vocabulary: VocabularyStore;
}

const EMPTY_PROGRESS_DATE = "0001-01-01T00:00:00.000Z";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function safeInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.round(safeNumber(value, fallback, minimum, maximum));
}

function safeIso(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
}

function repairMojibake(value: string): string {
  if (!/[ÃÂâÉËÊÎ]/u.test(value)) {
    return value;
  }

  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }
    const mapped = CP_1252_REVERSE[codePoint];
    if (mapped === undefined) {
      return value;
    }
    bytes.push(mapped);
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    const originalNoise = (value.match(/[ÃÂâÉËÊÎ]/gu) ?? []).length;
    const decodedNoise = (decoded.match(/[ÃÂâÉËÊÎ]/gu) ?? []).length;
    return decodedNoise < originalNoise ? decoded : value;
  } catch {
    return value;
  }
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = repairMojibake(value).trim();
  return cleaned.length ? cleaned : null;
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const cleaned = cleanText(item);
        return cleaned ? [cleaned] : [];
      })
    : [];
}

function hydrateWord(value: unknown, index = 0, listId = "wordlist"): WordEntry {
  const source = isRecord(value) ? value : {};
  const fallbackId = `${listId}-${String(index + 1).padStart(3, "0")}`;
  return {
    id: cleanText(source.id) ?? fallbackId,
    term: cleanText(source.term) ?? "",
    partOfSpeech: cleanText(source.partOfSpeech),
    pronunciation: cleanText(source.pronunciation),
    shortMeaning: cleanText(source.shortMeaning),
    chapter:
      typeof source.chapter === "number" && Number.isFinite(source.chapter)
        ? Math.round(source.chapter)
        : null,
    order:
      typeof source.order === "number" && Number.isFinite(source.order)
        ? Math.round(source.order)
        : null,
    tags: cleanStringArray(source.tags),
    exampleSentences: cleanStringArray(source.exampleSentences),
    collocations: cleanStringArray(source.collocations),
    synonyms: cleanStringArray(source.synonyms),
    antonyms: cleanStringArray(source.antonyms),
    notes: cleanText(source.notes),
    difficulty: safeNumber(source.difficulty, 3, 1, 10),
    enrichmentSource: cleanText(source.enrichmentSource),
  };
}

function hydrateList(value: unknown, builtIn = false): WordList {
  const source = isRecord(value) ? value : {};
  const id = cleanText(source.id) ?? crypto.randomUUID();
  const rawWords = Array.isArray(source.words) ? source.words : [];
  return {
    schemaVersion: 1,
    id,
    title: cleanText(source.title) ?? "Imported wordlist",
    language: cleanText(source.language) ?? "en",
    source: cleanText(source.source),
    words: rawWords
      .map((word, index) => hydrateWord(word, index, id))
      .filter((word) => word.term.length > 0),
    isEnabled: source.isEnabled !== false,
    isBuiltIn: builtIn,
  };
}

const BUILT_IN_LISTS = [hydrateList(rawBuiltInList, true), hydrateList(rawNeoList, true)];
const BUILT_IN_LIST_IDS = new Set(BUILT_IN_LISTS.map((list) => list.id));

function createDefaultStore(): VocabularyStore {
  return {
    schemaVersion: 1,
    settings: { ...DEFAULT_VOCABULARY_SETTINGS },
    progress: {},
    events: [],
    personalWords: [],
    importedLists: [],
    enabledLists: {
      ...Object.fromEntries(BUILT_IN_LISTS.map((list) => [list.id, true])),
      [PERSONAL_LIST_ID]: true,
    },
    collectionColors: {},
    personalListTitle: null,
    pausedUntil: null,
    nextReminderAt: null,
  };
}

function hydrateSettings(value: unknown): VocabularySettings {
  const source = isRecord(value) ? value : {};
  const defaults = DEFAULT_VOCABULARY_SETTINGS;
  const notificationModes = ["popup", "system", "both", "off"] as const;
  const selectionModes = ["dueFirst", "random"] as const;

  return {
    ...defaults,
    reminderIntervalMinutes: safeInteger(
      source.reminderIntervalMinutes,
      defaults.reminderIntervalMinutes,
      1,
      180,
    ),
    notificationMode:
      source.notificationMode === "toast"
        ? "system"
        : notificationModes.includes(source.notificationMode as (typeof notificationModes)[number])
          ? (source.notificationMode as VocabularySettings["notificationMode"])
          : defaults.notificationMode,
    popupDurationSeconds: safeInteger(
      source.popupDurationSeconds,
      defaults.popupDurationSeconds,
      5,
      120,
    ),
    quietHoursEnabled:
      typeof source.quietHoursEnabled === "boolean"
        ? source.quietHoursEnabled
        : defaults.quietHoursEnabled,
    quietHoursStart:
      typeof source.quietHoursStart === "string" && /^\d{2}:\d{2}$/.test(source.quietHoursStart)
        ? source.quietHoursStart
        : defaults.quietHoursStart,
    quietHoursEnd:
      typeof source.quietHoursEnd === "string" && /^\d{2}:\d{2}$/.test(source.quietHoursEnd)
        ? source.quietHoursEnd
        : defaults.quietHoursEnd,
    selectionMode: selectionModes.includes(source.selectionMode as (typeof selectionModes)[number])
      ? (source.selectionMode as VocabularySettings["selectionMode"])
      : defaults.selectionMode,
    startWithSystem:
      typeof source.startWithSystem === "boolean"
        ? source.startWithSystem
        : defaults.startWithSystem,
    globalHotkeyEnabled:
      typeof source.reviewShortcutEnabled === "boolean"
        ? source.reviewShortcutEnabled
        : typeof source.globalHotkeyEnabled === "boolean"
          ? source.globalHotkeyEnabled
          : defaults.globalHotkeyEnabled,
    reviewShortcutEnabled:
      typeof source.reviewShortcutEnabled === "boolean"
        ? source.reviewShortcutEnabled
        : typeof source.globalHotkeyEnabled === "boolean"
          ? source.globalHotkeyEnabled
          : defaults.reviewShortcutEnabled,
    clipboardQuickAddEnabled:
      typeof source.clipboardQuickAddEnabled === "boolean"
        ? source.clipboardQuickAddEnabled
        : defaults.clipboardQuickAddEnabled,
    dictionaryLookupEnabled:
      typeof source.dictionaryLookupEnabled === "boolean"
        ? source.dictionaryLookupEnabled
        : defaults.dictionaryLookupEnabled,
    soundEnabled:
      typeof source.soundEnabled === "boolean" ? source.soundEnabled : defaults.soundEnabled,
    compactNotificationsWhenFullscreen:
      typeof source.compactNotificationsWhenFullscreen === "boolean"
        ? source.compactNotificationsWhenFullscreen
        : defaults.compactNotificationsWhenFullscreen,
    voiceName: cleanText(source.voiceName),
    speechRate: safeNumber(source.speechRate, defaults.speechRate, 0.5, 2),
    defaultSessionSize: safeInteger(source.defaultSessionSize, defaults.defaultSessionSize, 5, 100),
    dailyReviewGoal: safeInteger(source.dailyReviewGoal, defaults.dailyReviewGoal, 1, 500),
    lastSessionGoal: safeInteger(source.lastSessionGoal, defaults.lastSessionGoal, 1, 100),
    lastSessionWordListId: cleanText(source.lastSessionWordListId),
    lastSessionDifficultOnly:
      typeof source.lastSessionDifficultOnly === "boolean"
        ? source.lastSessionDifficultOnly
        : defaults.lastSessionDifficultOnly,
    lastSessionTimed:
      typeof source.lastSessionTimed === "boolean"
        ? source.lastSessionTimed
        : defaults.lastSessionTimed,
    lastSessionFocusMode:
      typeof source.lastSessionFocusMode === "boolean"
        ? source.lastSessionFocusMode
        : defaults.lastSessionFocusMode,
    lastVocabularyRoute:
      typeof source.lastVocabularyRoute === "string" &&
      source.lastVocabularyRoute.startsWith("/vocabulary/")
        ? source.lastVocabularyRoute
        : defaults.lastVocabularyRoute,
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

function hydrateProgress(wordId: string, value: unknown): ReviewProgressEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    wordId,
    timesSeen: safeInteger(value.timesSeen, 0, 0, Number.MAX_SAFE_INTEGER),
    timesKnown: safeInteger(value.timesKnown, 0, 0, Number.MAX_SAFE_INTEGER),
    timesLater: safeInteger(value.timesLater, 0, 0, Number.MAX_SAFE_INTEGER),
    timesSkipped: safeInteger(value.timesSkipped, 0, 0, Number.MAX_SAFE_INTEGER),
    lastReviewedAt: safeIso(value.lastReviewedAt, null),
    dueAt: safeIso(value.dueAt, EMPTY_PROGRESS_DATE) ?? EMPTY_PROGRESS_DATE,
    stabilityDays: safeNumber(value.stabilityDays, 1, 0.25, 365),
    memoryDifficulty: safeNumber(value.memoryDifficulty, 5, 1, 10),
    lapses: safeInteger(value.lapses, 0, 0, Number.MAX_SAFE_INTEGER),
    consecutiveCorrect: safeInteger(value.consecutiveCorrect, 0, 0, Number.MAX_SAFE_INTEGER),
    lastResponseSeconds: safeNumber(value.lastResponseSeconds, 0, 0, 86_400),
  };
}

function hydrateEvent(value: unknown): ReviewEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  const action =
    value.action === "known" || value.action === "later" || value.action === "skipped"
      ? value.action
      : null;
  const timestamp = safeIso(value.timestamp, null);
  const wordId = cleanText(value.wordId);
  const wordListId = cleanText(value.wordListId);
  const term = cleanText(value.term);
  if (!action || !timestamp || !wordId || !wordListId || !term) {
    return null;
  }
  return {
    id: cleanText(value.id) ?? crypto.randomUUID(),
    timestamp,
    wordListId,
    wordId,
    term,
    action,
    responseSeconds: safeNumber(value.responseSeconds, 0, 0, 86_400),
  };
}

function assertVocabularySchemaVersion(
  value: Record<string, unknown>,
  scope = "vocabulary data",
): void {
  const version = value.schemaVersion;

  // The original browser prototype did not always include a version. Treat
  // that shape as v0 and migrate it through the v1 hydrator below.
  if (version === undefined || version === VOCABULARY_SCHEMA_VERSION) {
    return;
  }

  if (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version > VOCABULARY_SCHEMA_VERSION
  ) {
    throw new UnsupportedSchemaVersionError(scope, version, VOCABULARY_SCHEMA_VERSION);
  }

  throw new InvalidBackupError(
    `The ${scope} has an unsupported schema version.`,
    "vocabulary.schemaVersion",
  );
}

function assertVersionedStoreShape(value: Record<string, unknown>): void {
  const isCurrentSchema = value.schemaVersion === VOCABULARY_SCHEMA_VERSION;
  if (isCurrentSchema) {
    if (
      !isRecord(value.settings) ||
      !isRecord(value.progress) ||
      !Array.isArray(value.events) ||
      !Array.isArray(value.personalWords) ||
      !Array.isArray(value.importedLists) ||
      !isRecord(value.enabledLists) ||
      !(value.pausedUntil === null || typeof value.pausedUntil === "string") ||
      !(value.nextReminderAt === null || typeof value.nextReminderAt === "string")
    ) {
      throw new InvalidBackupError(
        "The vocabulary section is incomplete or malformed.",
        "vocabulary",
      );
    }
  }

  if (!Array.isArray(value.importedLists)) {
    return;
  }

  for (const list of value.importedLists) {
    if (!isRecord(list)) {
      throw new InvalidBackupError(
        "The vocabulary section contains an invalid imported wordlist.",
        "vocabulary.importedLists",
      );
    }
    const listVersion = list.schemaVersion;
    if (typeof listVersion === "number" && Number.isInteger(listVersion) && listVersion > 1) {
      throw new UnsupportedSchemaVersionError("wordlist", listVersion, 1);
    }
    if (listVersion !== undefined && listVersion !== 1) {
      throw new InvalidBackupError(
        "An imported wordlist has an unsupported schema version.",
        "vocabulary.importedLists.schemaVersion",
      );
    }
  }
}

function isCollectionColor(value: unknown): value is CollectionColor {
  return typeof value === "string" && (COLLECTION_COLORS as readonly string[]).includes(value);
}

function hydrateCollectionColors(value: unknown): Record<string, CollectionColor> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, CollectionColor] =>
      isCollectionColor(entry[1]),
    ),
  );
}

function hydrateStore(value: Record<string, unknown>): VocabularyStore {
  const defaults = createDefaultStore();

  const progress = isRecord(value.progress)
    ? Object.fromEntries(
        Object.entries(value.progress).flatMap(([wordId, entry]) => {
          const hydrated = hydrateProgress(wordId, entry);
          return hydrated ? [[wordId, hydrated]] : [];
        }),
      )
    : {};

  const events = Array.isArray(value.events)
    ? value.events
        .map(hydrateEvent)
        .filter((event): event is ReviewEvent => event !== null)
        .slice(-MAX_EVENTS)
    : [];

  const importedLists = Array.isArray(value.importedLists)
    ? value.importedLists
        .map((list) => hydrateList(list))
        .filter((list) => !BUILT_IN_LIST_IDS.has(list.id) && list.id !== PERSONAL_LIST_ID)
    : [];

  const enabledLists = isRecord(value.enabledLists)
    ? Object.fromEntries(
        Object.entries(value.enabledLists).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
        ),
      )
    : defaults.enabledLists;

  return {
    schemaVersion: 1,
    settings: hydrateSettings(value.settings),
    progress,
    events,
    personalWords: Array.isArray(value.personalWords)
      ? value.personalWords
          .map((word, index) => hydrateWord(word, index, PERSONAL_LIST_ID))
          .filter((word) => word.term.length > 0)
      : [],
    importedLists,
    enabledLists: {
      ...defaults.enabledLists,
      ...enabledLists,
    },
    // Both are absent from stores saved before collections could be renamed or
    // coloured, and hydrate to the defaults.
    collectionColors: hydrateCollectionColors(value.collectionColors),
    personalListTitle: cleanText(value.personalListTitle)?.slice(0, 80) ?? null,
    pausedUntil: safeIso(value.pausedUntil, null),
    nextReminderAt: safeIso(value.nextReminderAt, null),
  };
}

/**
 * Validates and migrates a portable vocabulary payload without writing it.
 * Unknown future schemas are rejected before callers can overwrite them.
 */
export function parseVocabularyPortableState(value: unknown): VocabularyStore {
  if (!isRecord(value)) {
    throw new InvalidBackupError(
      "The backup does not contain valid vocabulary data.",
      "vocabulary",
    );
  }

  assertVocabularySchemaVersion(value);
  assertVersionedStoreShape(value);
  return hydrateStore(value);
}

function readStore(): VocabularyStore {
  const value = readJsonValue(VOCABULARY_STORAGE_KEY);
  if (value === undefined) {
    return createDefaultStore();
  }

  try {
    return parseVocabularyPortableState(value);
  } catch (error) {
    if (error instanceof UnsupportedSchemaVersionError) {
      throw error;
    }
    if (error instanceof InvalidBackupError) {
      throw new StorageParseError(VOCABULARY_STORAGE_KEY, error);
    }
    throw error;
  }
}

function writeStore(store: VocabularyStore): void {
  const normalized = parseVocabularyPortableState(store);
  writeJsonValue(VOCABULARY_STORAGE_KEY, normalized);
  dispatchLocalChange(VOCABULARY_CHANGE_EVENT);
}

export function vocabularyStorageEntry(value: unknown): readonly [string, VocabularyStore] {
  return [VOCABULARY_STORAGE_KEY, parseVocabularyPortableState(value)] as const;
}

function createWordLists(store: VocabularyStore): WordList[] {
  const colorFor = (listId: string, fallbackIndex: number): CollectionColor =>
    store.collectionColors[listId] ??
    DEFAULT_LIST_COLORS[listId] ??
    COLLECTION_COLORS[fallbackIndex % COLLECTION_COLORS.length];

  const personalList: WordList = {
    schemaVersion: 1,
    id: PERSONAL_LIST_ID,
    title: store.personalListTitle ?? PERSONAL_LIST_TITLE,
    language: "en",
    source: "Added in TOEFL Companion",
    words: store.personalWords,
    isEnabled: store.enabledLists[PERSONAL_LIST_ID] !== false,
    isBuiltIn: false,
    color: colorFor(PERSONAL_LIST_ID, 0),
  };

  return [
    ...BUILT_IN_LISTS.map((list) => ({
      ...list,
      isEnabled: store.enabledLists[list.id] !== false,
      color: colorFor(list.id, 0),
    })),
    personalList,
    ...store.importedLists.map((list, index) => ({
      ...list,
      isEnabled: store.enabledLists[list.id] !== false,
      // Lists made before colours existed start after the three fixed ones.
      color: colorFor(list.id, index + 3),
    })),
  ];
}

function removeWordFrom(store: VocabularyStore, listId: string, wordId: string): void {
  if (listId === PERSONAL_LIST_ID) {
    store.personalWords = store.personalWords.filter((word) => word.id !== wordId);
    return;
  }
  const list = store.importedLists.find((candidate) => candidate.id === listId);
  if (list) {
    list.words = list.words.filter((word) => word.id !== wordId);
  }
}

function appendWordTo(store: VocabularyStore, listId: string, word: WordEntry): void {
  if (listId === PERSONAL_LIST_ID) {
    store.personalWords.push(word);
    return;
  }
  const list = store.importedLists.find((candidate) => candidate.id === listId);
  if (!list) {
    throw new Error("The selected collection is no longer available.");
  }
  list.words.push(word);
}

/** The tag a word carries says which kind of list made it. Moving keeps that honest. */
function retagWord(word: WordEntry, toListId: string, order: number): WordEntry {
  const toTag = toListId === PERSONAL_LIST_ID ? "Personal" : "Custom";
  return {
    ...word,
    order,
    tags: word.tags.map((tag) => (tag === "Personal" || tag === "Custom" ? toTag : tag)),
  };
}

function mutate(mutator: (store: VocabularyStore) => void): VocabularySnapshot {
  const store = readStore();
  mutator(store);
  writeStore(store);
  return { ...store, wordLists: createWordLists(store) };
}

export function normalizeVocabularyTerm(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function enrichWord(term: string): Promise<Partial<WordEntry>> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) {
      return {};
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload) || !isRecord(payload[0])) {
      return {};
    }
    const entry = payload[0];
    const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : [];
    const pronunciation =
      phonetics.map((item) => (isRecord(item) ? cleanText(item.text) : null)).find(Boolean) ?? null;
    const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
    const firstMeaning = meanings.find(isRecord);
    const partOfSpeech = firstMeaning ? cleanText(firstMeaning.partOfSpeech) : null;
    const definitions =
      firstMeaning && Array.isArray(firstMeaning.definitions) ? firstMeaning.definitions : [];
    const firstDefinition = definitions.find(isRecord);
    const shortMeaning = firstDefinition ? cleanText(firstDefinition.definition) : null;
    const example = firstDefinition ? cleanText(firstDefinition.example) : null;
    return {
      pronunciation,
      partOfSpeech,
      shortMeaning,
      exampleSentences: example ? [example] : [],
      enrichmentSource: "dictionaryapi.dev",
    };
  } catch {
    return {};
  }
}

export const vocabularyRepository = {
  changeEvent: VOCABULARY_CHANGE_EVENT,
  builtInListId: BUILT_IN_LISTS[0].id,
  builtInListIds: BUILT_IN_LISTS.map((list) => list.id),
  personalListId: PERSONAL_LIST_ID,

  getSnapshot(): VocabularySnapshot {
    const store = readStore();
    return { ...store, wordLists: createWordLists(store) };
  },

  getAllWords(snapshot?: VocabularySnapshot): WordLocation[] {
    const current = snapshot ?? vocabularyRepository.getSnapshot();
    return current.wordLists.flatMap((list) => list.words.map((word) => ({ word, list })));
  },

  getEnabledWords(snapshot?: VocabularySnapshot): WordLocation[] {
    const current = snapshot ?? vocabularyRepository.getSnapshot();
    return current.wordLists
      .filter((list) => list.isEnabled)
      .flatMap((list) => list.words.map((word) => ({ word, list })));
  },

  findWord(wordId: string, snapshot?: VocabularySnapshot): WordLocation | null {
    const current = snapshot ?? vocabularyRepository.getSnapshot();
    for (const list of current.wordLists) {
      const word = list.words.find((candidate) => candidate.id === wordId);
      if (word) {
        return { word, list };
      }
    }
    return null;
  },

  saveSettings(settings: VocabularySettings): VocabularySnapshot {
    return mutate((store) => {
      store.settings = hydrateSettings(settings);
      store.nextReminderAt = null;
    });
  },

  resetSettings(): VocabularySnapshot {
    return mutate((store) => {
      store.settings = { ...DEFAULT_VOCABULARY_SETTINGS };
      store.nextReminderAt = null;
      store.pausedUntil = null;
    });
  },

  setListEnabled(listId: string, enabled: boolean): VocabularySnapshot {
    return mutate((store) => {
      store.enabledLists[listId] = enabled;
      store.nextReminderAt = null;
    });
  },

  saveSessionPreferences(
    preferences: Pick<
      VocabularySettings,
      | "lastSessionGoal"
      | "lastSessionWordListId"
      | "lastSessionDifficultOnly"
      | "lastSessionTimed"
      | "lastSessionFocusMode"
    >,
  ): VocabularySnapshot {
    return mutate((store) => {
      store.settings = hydrateSettings({
        ...store.settings,
        ...preferences,
      });
    });
  },

  collectionColors: COLLECTION_COLORS,

  /** Trims a collection name and checks it against every other list's name. */
  assertCollectionTitle(title: string, exceptListId?: string): string {
    const normalized = title.trim();
    if (!normalized) {
      throw new Error("Give the collection a name.");
    }
    if (normalized.length > 80) {
      throw new Error("Keep the name under 80 characters.");
    }
    const clash = this.getSnapshot().wordLists.find(
      (list) =>
        list.id !== exceptListId &&
        list.title.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
    );
    if (clash) {
      throw new Error(`There is already a collection called “${clash.title}”.`);
    }
    return normalized;
  },

  createWordList(title: string, color?: CollectionColor): WordList {
    const normalizedTitle = this.assertCollectionTitle(title);
    const snapshot = this.getSnapshot();
    const worn = new Set(snapshot.wordLists.map((list) => list.color));
    const chosen: CollectionColor =
      color && isCollectionColor(color)
        ? color
        : (COLLECTION_COLORS.find((candidate) => !worn.has(candidate)) ??
          COLLECTION_COLORS[snapshot.wordLists.length % COLLECTION_COLORS.length]);

    const list: WordList = {
      schemaVersion: 1,
      id: `custom-${crypto.randomUUID()}`,
      title: normalizedTitle,
      language: "en",
      source: "Created in TOEFL Companion",
      words: [],
      isEnabled: true,
      isBuiltIn: false,
    };
    mutate((store) => {
      store.importedLists.push(list);
      store.enabledLists[list.id] = true;
      store.collectionColors[list.id] = chosen;
    });
    return { ...list, color: chosen };
  },

  renameWordList(listId: string, title: string): WordList {
    const list = this.getSnapshot().wordLists.find((candidate) => candidate.id === listId);
    if (!list) {
      throw new Error("That collection is no longer in the library.");
    }
    if (list.isBuiltIn) {
      throw new Error("Built-in collections keep their names.");
    }
    const normalized = this.assertCollectionTitle(title, listId);
    const snapshot = mutate((store) => {
      if (listId === PERSONAL_LIST_ID) {
        store.personalListTitle = normalized === PERSONAL_LIST_TITLE ? null : normalized;
        return;
      }
      const stored = store.importedLists.find((candidate) => candidate.id === listId);
      if (stored) {
        stored.title = normalized;
      }
    });
    return snapshot.wordLists.find((candidate) => candidate.id === listId) ?? list;
  },

  setListColor(listId: string, color: CollectionColor): VocabularySnapshot {
    if (!isCollectionColor(color)) {
      throw new Error("Choose one of the collection colours.");
    }
    if (!this.getSnapshot().wordLists.some((list) => list.id === listId)) {
      throw new Error("That collection is no longer in the library.");
    }
    return mutate((store) => {
      store.collectionColors[listId] = color;
    });
  },

  /** Moves a word between the learner's own collections. The id is kept, so
   *  its review history and schedule move with it. */
  moveWord(wordId: string, toListId: string): WordLocation {
    const snapshot = this.getSnapshot();
    const location = this.findWord(wordId, snapshot);
    if (!location) {
      throw new Error("That word is no longer in the library.");
    }
    if (location.list.isBuiltIn) {
      throw new Error("Words in built-in collections stay where they are.");
    }
    const target = snapshot.wordLists.find((list) => list.id === toListId);
    if (!target || target.isBuiltIn) {
      throw new Error("Choose one of your own collections.");
    }
    if (target.id === location.list.id) {
      return location;
    }

    const moved = retagWord(location.word, target.id, target.words.length + 1);
    mutate((store) => {
      removeWordFrom(store, location.list.id, wordId);
      appendWordTo(store, target.id, moved);
    });
    return this.findWord(wordId) ?? { list: target, word: moved };
  },

  async addWordToList(draft: PersonalWordDraft, listId: string): Promise<WordEntry> {
    const term = draft.term.trim();
    if (!term) {
      throw new Error("Enter a word first.");
    }
    const snapshot = this.getSnapshot();
    const targetList = snapshot.wordLists.find((list) => list.id === listId);
    if (!targetList || targetList.isBuiltIn) {
      throw new Error("Choose an editable wordlist.");
    }
    const duplicate = this.getAllWords(snapshot).find(
      ({ word }) => normalizeVocabularyTerm(word.term) === normalizeVocabularyTerm(term),
    );
    if (duplicate) {
      throw new Error(`“${duplicate.word.term}” is already in your library.`);
    }

    const enriched =
      snapshot.settings.dictionaryLookupEnabled && (!draft.shortMeaning || !draft.pronunciation)
        ? await enrichWord(term)
        : {};
    const word: WordEntry = {
      id: `${listId}-${crypto.randomUUID()}`,
      term,
      partOfSpeech: cleanText(draft.partOfSpeech) ?? enriched.partOfSpeech ?? null,
      pronunciation: cleanText(draft.pronunciation) ?? enriched.pronunciation ?? null,
      shortMeaning: cleanText(draft.shortMeaning) ?? enriched.shortMeaning ?? null,
      chapter: null,
      order: targetList.words.length + 1,
      tags: [listId === PERSONAL_LIST_ID ? "Personal" : "Custom"],
      exampleSentences: cleanText(draft.exampleSentence)
        ? [cleanText(draft.exampleSentence)!]
        : (enriched.exampleSentences ?? []),
      collocations: cleanStringArray(draft.collocations),
      synonyms: [],
      antonyms: [],
      notes: cleanText(draft.notes),
      difficulty: 3,
      enrichmentSource: enriched.enrichmentSource ?? null,
    };
    mutate((store) => {
      if (listId === PERSONAL_LIST_ID) {
        store.personalWords.push(word);
      } else {
        const list = store.importedLists.find((candidate) => candidate.id === listId);
        if (!list) {
          throw new Error("The selected wordlist is no longer available.");
        }
        list.words.push(word);
      }
      store.enabledLists[listId] = true;
    });
    return word;
  },

  async addPersonalWord(draft: PersonalWordDraft): Promise<WordEntry> {
    return this.addWordToList(draft, PERSONAL_LIST_ID);
  },

  updateEditableWord(listId: string, wordId: string, updates: PersonalWordDraft): void {
    if (BUILT_IN_LIST_IDS.has(listId)) {
      throw new Error("Built-in wordlists cannot be edited.");
    }
    mutate((store) => {
      const words =
        listId === PERSONAL_LIST_ID
          ? store.personalWords
          : store.importedLists.find((list) => list.id === listId)?.words;
      if (!words) {
        throw new Error("The selected wordlist is no longer available.");
      }
      const index = words.findIndex((word) => word.id === wordId);
      if (index < 0) {
        throw new Error("The selected word is no longer available.");
      }
      const current = words[index];
      words[index] = {
        ...current,
        term: cleanText(updates.term) ?? current.term,
        partOfSpeech: cleanText(updates.partOfSpeech),
        pronunciation: cleanText(updates.pronunciation),
        shortMeaning: cleanText(updates.shortMeaning),
        exampleSentences: cleanText(updates.exampleSentence)
          ? [cleanText(updates.exampleSentence)!]
          : current.exampleSentences,
        collocations: Array.isArray(updates.collocations)
          ? cleanStringArray(updates.collocations)
          : current.collocations,
        notes: cleanText(updates.notes),
      };
    });
  },

  updatePersonalWord(wordId: string, updates: PersonalWordDraft): void {
    this.updateEditableWord(PERSONAL_LIST_ID, wordId, updates);
  },

  deleteEditableWord(listId: string, wordId: string): void {
    if (BUILT_IN_LIST_IDS.has(listId)) {
      throw new Error("Built-in wordlists cannot be edited.");
    }
    mutate((store) => {
      if (listId === PERSONAL_LIST_ID) {
        store.personalWords = store.personalWords.filter((word) => word.id !== wordId);
        return;
      }
      const list = store.importedLists.find((candidate) => candidate.id === listId);
      if (!list) {
        throw new Error("The selected wordlist is no longer available.");
      }
      list.words = list.words.filter((word) => word.id !== wordId);
    });
  },

  deletePersonalWord(wordId: string): void {
    this.deleteEditableWord(PERSONAL_LIST_ID, wordId);
  },

  importWordList(value: unknown, skipDuplicates: boolean): ImportResult {
    if (!isRecord(value) || value.schemaVersion !== 1) {
      throw new Error("This is not a schema version 1 wordlist.");
    }
    const candidate = hydrateList(value);
    if (!cleanText(value.id) || !cleanText(value.title)) {
      throw new Error("The wordlist needs a non-empty ID and title.");
    }
    if (!candidate.words.length) {
      throw new Error("The wordlist does not contain any valid words.");
    }
    const snapshot = this.getSnapshot();
    if (snapshot.wordLists.some((list) => list.id === candidate.id)) {
      throw new Error(`A wordlist with ID “${candidate.id}” already exists.`);
    }

    const knownIds = new Set(
      this.getAllWords(snapshot).map(({ word }) => word.id.toLocaleLowerCase()),
    );
    const localIds = new Set<string>();
    for (const word of candidate.words) {
      const id = word.id.toLocaleLowerCase();
      if (localIds.has(id)) {
        throw new Error(`The word ID “${word.id}” appears more than once.`);
      }
      if (knownIds.has(id)) {
        throw new Error(`The word ID “${word.id}” already exists.`);
      }
      localIds.add(id);
    }

    const knownTerms = new Set(
      this.getAllWords(snapshot).map(({ word }) => normalizeVocabularyTerm(word.term)),
    );
    const acceptedTerms = new Set<string>();
    const warnings: string[] = [];
    let skippedDuplicates = 0;
    const words = candidate.words.filter((word) => {
      const normalized = normalizeVocabularyTerm(word.term);
      const duplicate = knownTerms.has(normalized) || acceptedTerms.has(normalized);
      if (duplicate) {
        warnings.push(`Duplicate term: ${word.term}`);
        if (skipDuplicates) {
          skippedDuplicates += 1;
          return false;
        }
      }
      acceptedTerms.add(normalized);
      return true;
    });
    if (!words.length) {
      throw new Error("Every word in this file is already in your library.");
    }
    const list = { ...candidate, words, isEnabled: true, isBuiltIn: false };
    mutate((store) => {
      store.importedLists.push(list);
      store.enabledLists[list.id] = true;
    });
    return { list, warnings, skippedDuplicates };
  },

  deleteImportedList(listId: string): void {
    this.deleteWordList(listId);
  },

  /**
   * Removes a collection the learner created. With `moveWordsTo`, its words
   * are kept in that collection first; without it, they leave with it. Review
   * history is kept either way, because it is keyed by word id.
   */
  deleteWordList(listId: string, moveWordsTo?: string): void {
    if (listId === PERSONAL_LIST_ID || BUILT_IN_LIST_IDS.has(listId)) {
      throw new Error("Only collections you created can be deleted.");
    }
    const snapshot = this.getSnapshot();
    const list = snapshot.wordLists.find((candidate) => candidate.id === listId);
    if (!list) {
      return;
    }
    const target = moveWordsTo
      ? snapshot.wordLists.find((candidate) => candidate.id === moveWordsTo)
      : undefined;
    if (moveWordsTo && (!target || target.isBuiltIn || target.id === listId)) {
      throw new Error("Choose one of your own collections to keep these words in.");
    }

    mutate((store) => {
      if (target) {
        list.words.forEach((word, index) => {
          appendWordTo(
            store,
            target.id,
            retagWord(word, target.id, target.words.length + index + 1),
          );
        });
      }
      store.importedLists = store.importedLists.filter((candidate) => candidate.id !== listId);
      delete store.enabledLists[listId];
      delete store.collectionColors[listId];
    });
  },

  exportWordList(listId: string): string {
    const list = this.getSnapshot().wordLists.find((candidate) => candidate.id === listId);
    if (!list) {
      throw new Error("Wordlist not found.");
    }
    const { isBuiltIn: _isBuiltIn, isEnabled: _isEnabled, ...portable } = list;
    return JSON.stringify(portable, null, 2);
  },

  setProgress(
    wordId: string,
    progress: ReviewProgressEntry,
    event: Omit<ReviewEvent, "id">,
  ): VocabularySnapshot {
    return mutate((store) => {
      store.progress[wordId] = progress;
      store.events.push({ ...event, id: crypto.randomUUID() });
      store.events = store.events.slice(-MAX_EVENTS);
    });
  },

  snoozeWord(wordId: string, minutes: number): VocabularySnapshot {
    return mutate((store) => {
      const current = store.progress[wordId] ?? {
        wordId,
        timesSeen: 0,
        timesKnown: 0,
        timesLater: 0,
        timesSkipped: 0,
        lastReviewedAt: null,
        dueAt: EMPTY_PROGRESS_DATE,
        stabilityDays: 1,
        memoryDifficulty: 5,
        lapses: 0,
        consecutiveCorrect: 0,
        lastResponseSeconds: 0,
      };
      store.progress[wordId] = {
        ...current,
        dueAt: new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString(),
      };
    });
  },

  pauseReminders(minutes: number | null): VocabularySnapshot {
    return mutate((store) => {
      store.pausedUntil =
        minutes === null
          ? null
          : new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString();
      store.nextReminderAt = null;
    });
  },

  setNextReminderAt(value: string | null): VocabularySnapshot {
    return mutate((store) => {
      store.nextReminderAt = safeIso(value, null);
    });
  },

  getPortableState(): VocabularyStore {
    const snapshot = this.getSnapshot();
    const { wordLists: _wordLists, ...store } = snapshot;
    return parseVocabularyPortableState(store);
  },

  restorePortableState(value: unknown): VocabularySnapshot {
    const restored = parseVocabularyPortableState(value);
    writeStore(restored);
    return { ...restored, wordLists: createWordLists(restored) };
  },

  createBackup(): string {
    const backup: VocabularyBackup = {
      schemaVersion: 1,
      product: "toefl-companion",
      exportedAt: new Date().toISOString(),
      vocabulary: this.getPortableState(),
    };
    return JSON.stringify(backup, null, 2);
  },

  restoreBackup(value: unknown): VocabularySnapshot {
    if (!isRecord(value)) {
      throw new InvalidBackupError("This is not a valid TOEFL Companion vocabulary backup.");
    }
    if (
      typeof value.schemaVersion === "number" &&
      Number.isInteger(value.schemaVersion) &&
      value.schemaVersion > 1
    ) {
      throw new UnsupportedSchemaVersionError("vocabulary backup", value.schemaVersion, 1);
    }
    if (
      value.schemaVersion !== 1 ||
      value.product !== "toefl-companion" ||
      !isRecord(value.vocabulary)
    ) {
      throw new InvalidBackupError("This is not a valid TOEFL Companion vocabulary backup.");
    }
    const restored = parseVocabularyPortableState(value.vocabulary);
    writeStore(restored);
    return { ...restored, wordLists: createWordLists(restored) };
  },

  clearVocabularyData(): VocabularySnapshot {
    const store = createDefaultStore();
    writeStore(store);
    return { ...store, wordLists: createWordLists(store) };
  },
};

export function createEmptyProgress(wordId: string): ReviewProgressEntry {
  return {
    wordId,
    timesSeen: 0,
    timesKnown: 0,
    timesLater: 0,
    timesSkipped: 0,
    lastReviewedAt: null,
    dueAt: EMPTY_PROGRESS_DATE,
    stabilityDays: 1,
    memoryDifficulty: 5,
    lapses: 0,
    consecutiveCorrect: 0,
    lastResponseSeconds: 0,
  };
}

export function createReviewEvent(
  location: WordLocation,
  action: ReviewAction,
  responseSeconds: number,
): Omit<ReviewEvent, "id"> {
  return {
    timestamp: new Date().toISOString(),
    wordListId: location.list.id,
    wordId: location.word.id,
    term: location.word.term,
    action,
    responseSeconds: Math.max(0, responseSeconds),
  };
}
