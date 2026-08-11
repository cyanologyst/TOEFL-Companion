import type {
  ActivityKind,
  ListenRepeatAttempt,
  StudyActivity,
  StudySettings,
  StudyState,
  WritingPracticeRecord,
  WritingSubmission,
} from "../types/study";
import { dispatchLocalChange, readJsonValue, writeJsonValue } from "./storage";

export const STUDY_STORAGE_KEY = "toefl-companion:study:v1";
export const STUDY_CHANGE_EVENT = "toefl-companion:study-change";
const MAX_ACTIVITIES = 250;
const MAX_LISTEN_ATTEMPTS = 500;

/** The name every install used to start with, before the app asked. Anyone
 *  still carrying it never chose it, so they get the welcome dialog. */
const PLACEHOLDER_NAME = "Alex";
const MAX_NAME_LENGTH = 40;

const DEFAULT_SETTINGS: StudySettings = {
  learnerName: "",
  onboarded: false,
  targetTestDate: "",
  interviewSeconds: 40,
  writingSeconds: 600,
  autoSaveWriting: true,
  playSounds: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function finiteInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback;
}

function defaultState(): StudyState {
  return {
    schemaVersion: 1,
    writing: {},
    listenRepeatAttempts: [],
    activities: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function hydrateWritingRecord(value: unknown, discussionId: string): WritingPracticeRecord {
  const source = isRecord(value) ? value : {};
  const submissions = Array.isArray(source.submissions)
    ? source.submissions.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }
        const text = cleanText(entry.text);
        const submittedAt = cleanText(entry.submittedAt);
        if (!text || !Number.isFinite(Date.parse(submittedAt))) {
          return [];
        }
        return [
          {
            id: cleanText(entry.id, crypto.randomUUID()),
            text,
            wordCount: finiteInteger(entry.wordCount, 0, 0, 10_000),
            submittedAt: new Date(submittedAt).toISOString(),
          },
        ];
      })
    : [];

  return {
    discussionId,
    draft: typeof source.draft === "string" ? source.draft : "",
    updatedAt: Number.isFinite(Date.parse(cleanText(source.updatedAt)))
      ? new Date(cleanText(source.updatedAt)).toISOString()
      : new Date(0).toISOString(),
    submissions,
  };
}

function hydrateActivity(value: unknown): StudyActivity | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value.kind;
  const createdAt = cleanText(value.createdAt);
  if (
    (kind !== "vocabulary" && kind !== "speaking" && kind !== "writing") ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return null;
  }
  return {
    id: cleanText(value.id, crypto.randomUUID()),
    kind,
    title: cleanText(value.title, "Study activity"),
    detail: cleanText(value.detail),
    createdAt: new Date(createdAt).toISOString(),
  };
}

function hydrateState(value: unknown): StudyState {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return defaultState();
  }

  const writingEntries = isRecord(value.writing)
    ? Object.entries(value.writing).map(([discussionId, record]) => [
        discussionId,
        hydrateWritingRecord(record, discussionId),
      ])
    : [];
  const settings = isRecord(value.settings) ? value.settings : {};
  const listenRepeatAttempts = Array.isArray(value.listenRepeatAttempts)
    ? value.listenRepeatAttempts.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }
        const createdAt = cleanText(entry.createdAt);
        if (!Number.isFinite(Date.parse(createdAt))) {
          return [];
        }
        return [
          {
            id: cleanText(entry.id, crypto.randomUUID()),
            promptId: cleanText(entry.promptId),
            transcript: cleanText(entry.transcript),
            accuracy: finiteInteger(entry.accuracy, 0, 0, 100),
            createdAt: new Date(createdAt).toISOString(),
          },
        ];
      })
    : [];

  return {
    schemaVersion: 1,
    writing: Object.fromEntries(writingEntries),
    listenRepeatAttempts: listenRepeatAttempts.slice(-MAX_LISTEN_ATTEMPTS),
    activities: Array.isArray(value.activities)
      ? value.activities
          .map(hydrateActivity)
          .filter((entry): entry is StudyActivity => entry !== null)
          .slice(0, MAX_ACTIVITIES)
      : [],
    settings: {
      learnerName: cleanText(settings.learnerName).slice(0, MAX_NAME_LENGTH),
      // A saved file from before the welcome dialog has no flag, so infer it:
      // a name the learner actually typed counts as already answered.
      onboarded:
        typeof settings.onboarded === "boolean"
          ? settings.onboarded
          : cleanText(settings.learnerName) !== "" &&
            cleanText(settings.learnerName) !== PLACEHOLDER_NAME,
      targetTestDate: cleanText(settings.targetTestDate),
      interviewSeconds: finiteInteger(
        settings.interviewSeconds,
        DEFAULT_SETTINGS.interviewSeconds,
        15,
        90,
      ),
      writingSeconds: finiteInteger(
        settings.writingSeconds,
        DEFAULT_SETTINGS.writingSeconds,
        300,
        1_800,
      ),
      autoSaveWriting:
        typeof settings.autoSaveWriting === "boolean"
          ? settings.autoSaveWriting
          : DEFAULT_SETTINGS.autoSaveWriting,
      playSounds:
        typeof settings.playSounds === "boolean"
          ? settings.playSounds
          : DEFAULT_SETTINGS.playSounds,
    },
  };
}

export function parseStudyPortableState(value: unknown): StudyState {
  return hydrateState(value);
}

export function studyStorageEntry(value: unknown): readonly [string, StudyState] {
  return [STUDY_STORAGE_KEY, parseStudyPortableState(value)] as const;
}

function readState(): StudyState {
  return hydrateState(readJsonValue(STUDY_STORAGE_KEY));
}

function writeState(state: StudyState): StudyState {
  writeJsonValue(STUDY_STORAGE_KEY, state);
  dispatchLocalChange(STUDY_CHANGE_EVENT);
  return state;
}

function mutate(mutator: (draft: StudyState) => void): StudyState {
  const draft = structuredClone(readState());
  mutator(draft);
  return writeState(hydrateState(draft));
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export const studyRepository = {
  changeEvent: STUDY_CHANGE_EVENT,

  getSnapshot(): StudyState {
    return readState();
  },

  saveWritingDraft(discussionId: string, text: string): StudyState {
    return mutate((state) => {
      const current = state.writing[discussionId] ?? hydrateWritingRecord(undefined, discussionId);
      state.writing[discussionId] = {
        ...current,
        draft: text,
        updatedAt: new Date().toISOString(),
      };
    });
  },

  submitWriting(discussionId: string, text: string): WritingSubmission {
    const submission: WritingSubmission = {
      id: crypto.randomUUID(),
      text: text.trim(),
      wordCount: countWords(text),
      submittedAt: new Date().toISOString(),
    };
    mutate((state) => {
      const activity: StudyActivity = {
        id: crypto.randomUUID(),
        kind: "writing",
        title: "Submitted Academic Discussion",
        detail: `${submission.wordCount} words`,
        createdAt: submission.submittedAt,
      };
      const current = state.writing[discussionId] ?? hydrateWritingRecord(undefined, discussionId);
      state.writing[discussionId] = {
        ...current,
        draft: text,
        updatedAt: submission.submittedAt,
        submissions: [submission, ...current.submissions].slice(0, 25),
      };
      state.activities = [activity, ...state.activities].slice(0, MAX_ACTIVITIES);
    });
    return submission;
  },

  clearWritingDraft(discussionId: string): StudyState {
    return mutate((state) => {
      const current = state.writing[discussionId];
      if (current) {
        current.draft = "";
        current.updatedAt = new Date().toISOString();
      }
    });
  },

  addListenRepeatAttempt(
    input: Omit<ListenRepeatAttempt, "id" | "createdAt">,
  ): ListenRepeatAttempt {
    const attempt: ListenRepeatAttempt = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    mutate((state) => {
      const activity: StudyActivity = {
        id: crypto.randomUUID(),
        kind: "speaking",
        title: "Completed Listen & Repeat",
        detail: `${attempt.accuracy}% transcript match`,
        createdAt: attempt.createdAt,
      };
      state.listenRepeatAttempts = [attempt, ...state.listenRepeatAttempts].slice(
        0,
        MAX_LISTEN_ATTEMPTS,
      );
      state.activities = [activity, ...state.activities].slice(0, MAX_ACTIVITIES);
    });
    return attempt;
  },

  addActivity(kind: ActivityKind, title: string, detail: string): StudyActivity {
    const activity: StudyActivity = {
      id: crypto.randomUUID(),
      kind,
      title,
      detail,
      createdAt: new Date().toISOString(),
    };
    mutate((state) => {
      state.activities = [activity, ...state.activities].slice(0, MAX_ACTIVITIES);
    });
    return activity;
  },

  saveSettings(settings: StudySettings): StudyState {
    return mutate((state) => {
      state.settings = { ...settings };
    });
  },

  /** Records the answer to the welcome dialog. Marks the question asked even
   *  when the name comes back empty, so nobody is asked twice. */
  completeOnboarding(name: string): StudyState {
    return mutate((state) => {
      state.settings.learnerName = name.trim().slice(0, MAX_NAME_LENGTH);
      state.settings.onboarded = true;
    });
  },

  exportState(): string {
    return JSON.stringify(readState(), null, 2);
  },

  restoreState(value: unknown): StudyState {
    return writeState(hydrateState(value));
  },
};
