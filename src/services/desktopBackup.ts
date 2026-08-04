import { APP_DATA_RESTORED_EVENT, createAppBackup, parseAppBackup } from "./appBackup";
import { learningRepository, learningStorageEntries } from "./learningRepository";
import {
  STUDY_CHANGE_EVENT,
  parseStudyPortableState,
  studyRepository,
  studyStorageEntry,
} from "./studyRepository";
import { VOCABULARY_CHANGE_EVENT, vocabularyStorageEntry } from "./vocabularyRepository";
import { InvalidBackupError, dispatchLocalChange, writeJsonTransaction } from "./storage";
import type { StudyState } from "../types/study";
import type { LearningPortableState } from "./learningRepository";
import type { VocabularyStore } from "./vocabularyRepository";

export interface DesktopBackup {
  schemaVersion: 2;
  product: "toefl-companion";
  exportedAt: string;
  speaking: LearningPortableState;
  vocabulary: VocabularyStore;
  study: StudyState;
  note: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decode(value: string | unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new InvalidBackupError("The selected file is not valid JSON.", null, error);
  }
}

export function createDesktopBackup(): DesktopBackup {
  const legacy = createAppBackup();
  return {
    schemaVersion: 2,
    product: "toefl-companion",
    exportedAt: legacy.exportedAt,
    speaking: legacy.speaking,
    vocabulary: legacy.vocabulary,
    study: parseStudyPortableState(studyRepository.getSnapshot()),
    note: "Recording audio blobs stay on the original device; transcripts and metadata are included.",
  };
}

export function serializeDesktopBackup(): string {
  return JSON.stringify(createDesktopBackup(), null, 2);
}

export function restoreDesktopBackup(input: string | unknown): DesktopBackup {
  const value = decode(input);
  if (!isRecord(value)) {
    throw new InvalidBackupError("This is not a TOEFL Companion backup.");
  }

  if (value.schemaVersion === 1) {
    const legacy = parseAppBackup(value, learningRepository.getPortableState()).backup;
    const currentStudy = studyRepository.getSnapshot();
    writeJsonTransaction([
      ...learningStorageEntries(legacy.speaking),
      vocabularyStorageEntry(legacy.vocabulary),
      studyStorageEntry(currentStudy),
    ]);
    dispatchLocalChange(VOCABULARY_CHANGE_EVENT);
    dispatchLocalChange(STUDY_CHANGE_EVENT);
    dispatchLocalChange(APP_DATA_RESTORED_EVENT);
    return {
      schemaVersion: 2,
      product: "toefl-companion",
      exportedAt: legacy.exportedAt,
      speaking: legacy.speaking,
      vocabulary: legacy.vocabulary,
      study: currentStudy,
      note: "Legacy backup restored; current writing data was preserved.",
    };
  }

  if (
    value.schemaVersion !== 2 ||
    value.product !== "toefl-companion" ||
    typeof value.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(value.exportedAt))
  ) {
    throw new InvalidBackupError("This is not a supported TOEFL Companion backup.");
  }

  const legacy = parseAppBackup(
    {
      schemaVersion: 1,
      product: "toefl-companion",
      exportedAt: value.exportedAt,
      speaking: value.speaking,
      vocabulary: value.vocabulary,
    },
    learningRepository.getPortableState(),
  ).backup;
  const study = parseStudyPortableState(value.study);
  const backup: DesktopBackup = {
    schemaVersion: 2,
    product: "toefl-companion",
    exportedAt: new Date(value.exportedAt).toISOString(),
    speaking: legacy.speaking,
    vocabulary: legacy.vocabulary,
    study,
    note:
      typeof value.note === "string"
        ? value.note
        : "Recording audio blobs stay on the original device.",
  };

  writeJsonTransaction([
    ...learningStorageEntries(backup.speaking),
    vocabularyStorageEntry(backup.vocabulary),
    studyStorageEntry(backup.study),
  ]);
  dispatchLocalChange(VOCABULARY_CHANGE_EVENT);
  dispatchLocalChange(STUDY_CHANGE_EVENT);
  dispatchLocalChange(APP_DATA_RESTORED_EVENT);
  return backup;
}

export function suggestedDesktopBackupName(now = new Date()): string {
  const date = Number.isFinite(now.getTime()) ? now.toISOString().slice(0, 10) : "backup";
  return `toefl-companion-complete-backup-${date}.json`;
}
