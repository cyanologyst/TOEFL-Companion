import {
  learningRepository,
  learningStorageEntries,
  parseLearningPortableState,
  type LearningPortableState,
} from "./learningRepository";
import {
  VOCABULARY_CHANGE_EVENT,
  parseVocabularyPortableState,
  vocabularyRepository,
  vocabularyStorageEntry,
  type VocabularyStore,
} from "./vocabularyRepository";
import {
  InvalidBackupError,
  UnsupportedSchemaVersionError,
  dispatchLocalChange,
  writeJsonTransaction,
} from "./storage";

const APP_BACKUP_SCHEMA_VERSION = 1;
const PRODUCT_ID = "toefl-companion";

export const APP_DATA_RESTORED_EVENT = "toefl-companion:portable-data-restored";

export interface TOEFLCompanionBackup {
  schemaVersion: 1;
  product: "toefl-companion";
  exportedAt: string;
  speaking: LearningPortableState;
  vocabulary: VocabularyStore;
}

export interface ParsedAppBackup {
  backup: TOEFLCompanionBackup;
  sourceFormat: "full" | "legacy-vocabulary-only";
}

export interface BackupRestoreResult extends ParsedAppBackup {
  savedQuestionCount: number;
  speakingAttemptCount: number;
  personalWordCount: number;
  importedListCount: number;
  vocabularyReviewCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function decodeBackup(value: string | unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new InvalidBackupError("The selected file is not valid JSON.", null, error);
  }
}

function assertBackupHeader(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidBackupError("This is not a TOEFL Companion backup file.");
  }

  const version = value.schemaVersion;
  if (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version > APP_BACKUP_SCHEMA_VERSION
  ) {
    throw new UnsupportedSchemaVersionError("app backup", version, APP_BACKUP_SCHEMA_VERSION);
  }

  if (version !== APP_BACKUP_SCHEMA_VERSION || value.product !== PRODUCT_ID) {
    throw new InvalidBackupError("This is not a supported TOEFL Companion backup file.");
  }

  if (typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new InvalidBackupError("The backup is missing a valid export date.", "exportedAt");
  }
}

/**
 * Pure validation/migration step. Passing a speaking fallback enables import of
 * vocabulary-only backups created by the previous Settings screen without
 * replacing the user's current Speaking data.
 */
export function parseAppBackup(
  input: string | unknown,
  speakingFallback?: LearningPortableState,
): ParsedAppBackup {
  const value = decodeBackup(input);
  assertBackupHeader(value);

  if (!isRecord(value.vocabulary)) {
    throw new InvalidBackupError("The backup does not contain vocabulary data.", "vocabulary");
  }

  const vocabulary = parseVocabularyPortableState(value.vocabulary);
  let sourceFormat: ParsedAppBackup["sourceFormat"] = "full";
  let speaking: LearningPortableState;

  if (value.speaking === undefined) {
    if (!speakingFallback) {
      throw new InvalidBackupError(
        "This older backup contains Vocabulary only. Current Speaking data is required to migrate it safely.",
        "speaking",
      );
    }
    speaking = parseLearningPortableState(speakingFallback);
    sourceFormat = "legacy-vocabulary-only";
  } else {
    speaking = parseLearningPortableState(value.speaking);
  }

  return {
    sourceFormat,
    backup: {
      schemaVersion: 1,
      product: PRODUCT_ID,
      exportedAt: new Date(value.exportedAt as string).toISOString(),
      speaking,
      vocabulary,
    },
  };
}

export function createAppBackup(exportedAt = new Date().toISOString()): TOEFLCompanionBackup {
  const speakingWithDeviceRecordings = parseLearningPortableState(
    learningRepository.getPortableState(),
  );
  // Audio blobs live in IndexedDB and cannot be represented safely in the
  // portable JSON file. Preserve attempt metadata and notes while making the
  // playback state explicit after import on another device.
  const speaking: LearningPortableState = {
    ...speakingWithDeviceRecordings,
    history: speakingWithDeviceRecordings.history.map((item) => ({
      ...item,
      recordingAvailable: false,
      recordingId: undefined,
    })),
  };
  const vocabulary = parseVocabularyPortableState(vocabularyRepository.getPortableState());

  return {
    schemaVersion: 1,
    product: PRODUCT_ID,
    exportedAt: new Date(exportedAt).toISOString(),
    speaking,
    vocabulary,
  };
}

export function serializeAppBackup(backup: TOEFLCompanionBackup = createAppBackup()): string {
  const parsed = parseAppBackup(backup);
  return JSON.stringify(parsed.backup, null, 2);
}

export function restoreAppBackup(input: string | unknown): BackupRestoreResult {
  // Read current Speaking state before validation so a legacy vocabulary-only
  // backup can preserve it. No writes occur until every section validates.
  const speakingFallback = learningRepository.getPortableState();
  const parsed = parseAppBackup(input, speakingFallback);
  const { speaking, vocabulary } = parsed.backup;

  writeJsonTransaction([...learningStorageEntries(speaking), vocabularyStorageEntry(vocabulary)]);

  dispatchLocalChange(VOCABULARY_CHANGE_EVENT);
  dispatchLocalChange(APP_DATA_RESTORED_EVENT);

  return {
    ...parsed,
    savedQuestionCount: speaking.savedKeys.length,
    speakingAttemptCount: speaking.history.length,
    personalWordCount: vocabulary.personalWords.length,
    importedListCount: vocabulary.importedLists.length,
    vocabularyReviewCount: vocabulary.events.length,
  };
}

export function suggestedBackupFileName(now = new Date()): string {
  const date = Number.isFinite(now.getTime()) ? now.toISOString().slice(0, 10) : "backup";
  return `toefl-companion-backup-${date}.json`;
}

export const appBackupService = {
  createBackup: serializeAppBackup,
  parseBackup: parseAppBackup,
  restoreBackup: restoreAppBackup,
  suggestedFileName: suggestedBackupFileName,
};
