import type { AttemptHistoryItem } from "../types/toefl";
import {
  InvalidBackupError,
  UnsupportedSchemaVersionError,
  readJsonValue,
  writeJsonTransaction,
  writeJsonValue,
} from "./storage";

const STORAGE_VERSION = "v1";
const LEARNING_SCHEMA_VERSION = 1;
const MAX_HISTORY_ITEMS = 100;

export const LEARNING_STORAGE_KEYS = {
  saved: `toefl-practice:saved:${STORAGE_VERSION}`,
  collapsed: `toefl-practice:collapsed:${STORAGE_VERSION}`,
  targets: `toefl-practice:targets:${STORAGE_VERSION}`,
  history: `toefl-practice:history:${STORAGE_VERSION}`,
} as const;

export interface LearningPortableState {
  schemaVersion: 1;
  savedKeys: string[];
  collapsedCategories: string[];
  targetPhrases: Record<string, string[]>;
  history: AttemptHistoryItem[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isQuestionKey = (value: string): boolean => /^(?:[1-9]|[12]\d|30)-[1-4]$/.test(value);

function normalizeStringArray(
  value: unknown,
  predicate: (value: string) => boolean = () => true,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (item): item is string => typeof item === "string" && item.length > 0 && predicate(item),
      ),
    ),
  ];
}

function normalizeTargetPhrases(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, phrases]) => {
      const normalized = normalizeStringArray(phrases);
      return normalized.length ? [[key, normalized]] : [];
    }),
  );
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length ? value.trim() : undefined;
}

function isHistoryItem(value: unknown): value is AttemptHistoryItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Number.isInteger(value.topicId) &&
    Number(value.topicId) >= 1 &&
    Number(value.topicId) <= 30 &&
    Number.isInteger(value.questionIndex) &&
    Number(value.questionIndex) >= 0 &&
    Number(value.questionIndex) <= 3 &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.durationSeconds === "number" &&
    Number.isFinite(value.durationSeconds) &&
    value.durationSeconds >= 0 &&
    typeof value.wordCount === "number" &&
    Number.isFinite(value.wordCount) &&
    value.wordCount >= 0 &&
    (value.promptSnapshot === undefined || typeof value.promptSnapshot === "string") &&
    (value.notes === undefined || typeof value.notes === "string") &&
    (value.recordingAvailable === undefined || typeof value.recordingAvailable === "boolean") &&
    (value.recordingId === undefined || typeof value.recordingId === "string") &&
    (value.mimeType === undefined || typeof value.mimeType === "string") &&
    (value.size === undefined ||
      (typeof value.size === "number" && Number.isFinite(value.size) && value.size >= 0))
  );
}

function normalizeHistoryItem(value: AttemptHistoryItem): AttemptHistoryItem {
  const promptSnapshot = optionalText(value.promptSnapshot);
  const notes = optionalText(value.notes);
  const recordingId = optionalText(value.recordingId);
  const mimeType = optionalText(value.mimeType);
  const recordingAvailable = value.recordingAvailable === true && Boolean(recordingId);

  return {
    id: value.id,
    topicId: value.topicId,
    questionIndex: value.questionIndex,
    createdAt: new Date(value.createdAt).toISOString(),
    durationSeconds: Math.max(0, value.durationSeconds),
    wordCount: Math.max(0, Math.round(value.wordCount)),
    ...(promptSnapshot ? { promptSnapshot } : {}),
    ...(notes ? { notes } : {}),
    ...(recordingId ? { recordingId } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(typeof value.size === "number" ? { size: Math.max(0, value.size) } : {}),
    // Legacy entries do not contain recordingAvailable + recordingId and
    // therefore hydrate as unavailable. New entries keep the verified
    // IndexedDB recording reference.
    recordingAvailable,
  };
}

function normalizeHistory(value: unknown): AttemptHistoryItem[] {
  return Array.isArray(value)
    ? value.filter(isHistoryItem).map(normalizeHistoryItem).slice(0, MAX_HISTORY_ITEMS)
    : [];
}

function assertLearningSchemaVersion(value: Record<string, unknown>): void {
  const version = value.schemaVersion;

  // Unversioned objects are the legacy format and migrate directly to v1.
  if (version === undefined || version === LEARNING_SCHEMA_VERSION) {
    return;
  }

  if (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version > LEARNING_SCHEMA_VERSION
  ) {
    throw new UnsupportedSchemaVersionError("speaking backup", version, LEARNING_SCHEMA_VERSION);
  }

  throw new InvalidBackupError(
    "The speaking data has an unsupported schema version.",
    "speaking.schemaVersion",
  );
}

/**
 * Validates and migrates a portable speaking payload without changing storage.
 * This pure step lets full-app restore validate every section before writing.
 */
export function parseLearningPortableState(value: unknown): LearningPortableState {
  if (!isRecord(value)) {
    throw new InvalidBackupError("The backup does not contain valid speaking data.", "speaking");
  }

  assertLearningSchemaVersion(value);

  if (
    !Array.isArray(value.savedKeys) ||
    !Array.isArray(value.collapsedCategories) ||
    !isRecord(value.targetPhrases) ||
    !Array.isArray(value.history)
  ) {
    throw new InvalidBackupError("The speaking section is incomplete or malformed.", "speaking");
  }

  const invalidSavedKey = value.savedKeys.some(
    (key) => typeof key !== "string" || !isQuestionKey(key),
  );
  const invalidCollapsedCategory = value.collapsedCategories.some(
    (category) => typeof category !== "string",
  );
  const invalidTargets = Object.values(value.targetPhrases).some(
    (phrases) => !Array.isArray(phrases) || phrases.some((phrase) => typeof phrase !== "string"),
  );
  const invalidHistory = value.history.some((item) => !isHistoryItem(item));

  if (invalidSavedKey || invalidCollapsedCategory || invalidTargets || invalidHistory) {
    throw new InvalidBackupError(
      "The speaking section contains one or more invalid entries.",
      "speaking",
    );
  }

  return {
    schemaVersion: 1,
    savedKeys: normalizeStringArray(value.savedKeys, isQuestionKey),
    collapsedCategories: normalizeStringArray(value.collapsedCategories),
    targetPhrases: normalizeTargetPhrases(value.targetPhrases),
    history: normalizeHistory(value.history),
  };
}

export function learningStorageEntries(
  state: LearningPortableState,
): ReadonlyArray<readonly [string, unknown]> {
  const normalized = parseLearningPortableState(state);
  return [
    [LEARNING_STORAGE_KEYS.saved, normalized.savedKeys],
    [LEARNING_STORAGE_KEYS.collapsed, normalized.collapsedCategories],
    [LEARNING_STORAGE_KEYS.targets, normalized.targetPhrases],
    [LEARNING_STORAGE_KEYS.history, normalized.history],
  ];
}

export interface LearningRepository {
  getSavedKeys(): string[];
  setSavedKeys(keys: string[]): void;
  getCollapsedCategories(): string[];
  setCollapsedCategories(categories: string[]): void;
  getTargetPhrases(): Record<string, string[]>;
  setTargetPhrases(targets: Record<string, string[]>): void;
  getHistory(): AttemptHistoryItem[];
  setHistory(items: AttemptHistoryItem[]): void;
  getPortableState(): LearningPortableState;
  restorePortableState(value: unknown): LearningPortableState;
}

class BrowserLearningRepository implements LearningRepository {
  getSavedKeys(): string[] {
    return normalizeStringArray(readJsonValue(LEARNING_STORAGE_KEYS.saved), isQuestionKey);
  }

  setSavedKeys(keys: string[]): void {
    writeJsonValue(LEARNING_STORAGE_KEYS.saved, normalizeStringArray(keys, isQuestionKey));
  }

  getCollapsedCategories(): string[] {
    return normalizeStringArray(readJsonValue(LEARNING_STORAGE_KEYS.collapsed));
  }

  setCollapsedCategories(categories: string[]): void {
    writeJsonValue(LEARNING_STORAGE_KEYS.collapsed, normalizeStringArray(categories));
  }

  getTargetPhrases(): Record<string, string[]> {
    return normalizeTargetPhrases(readJsonValue(LEARNING_STORAGE_KEYS.targets));
  }

  setTargetPhrases(targets: Record<string, string[]>): void {
    writeJsonValue(LEARNING_STORAGE_KEYS.targets, normalizeTargetPhrases(targets));
  }

  getHistory(): AttemptHistoryItem[] {
    return normalizeHistory(readJsonValue(LEARNING_STORAGE_KEYS.history));
  }

  setHistory(items: AttemptHistoryItem[]): void {
    writeJsonValue(LEARNING_STORAGE_KEYS.history, normalizeHistory(items));
  }

  getPortableState(): LearningPortableState {
    return {
      schemaVersion: 1,
      savedKeys: this.getSavedKeys(),
      collapsedCategories: this.getCollapsedCategories(),
      targetPhrases: this.getTargetPhrases(),
      history: this.getHistory(),
    };
  }

  restorePortableState(value: unknown): LearningPortableState {
    const state = parseLearningPortableState(value);
    writeJsonTransaction(learningStorageEntries(state));
    return state;
  }
}

export const learningRepository: LearningRepository = new BrowserLearningRepository();
