export type AppArea = "dashboard" | "vocabulary" | "speaking" | "writing" | "progress" | "settings";

export interface AcademicDiscussionStudent {
  name: string;
  response: string;
}

export interface AcademicDiscussion {
  id: string;
  sequence: number;
  week: number;
  title: string;
  course: string;
  professor: string;
  prompt: string;
  students: [AcademicDiscussionStudent, AcademicDiscussionStudent];
  recommendedWords: number;
  timeLimitSeconds: number;
  sourceImage: string;
}

export interface AcademicDiscussionLibrary {
  schemaVersion: 1;
  source: string;
  taskType: "TOEFL Academic Discussion";
  discussions: AcademicDiscussion[];
}

export interface WritingSubmission {
  id: string;
  text: string;
  wordCount: number;
  submittedAt: string;
}

export interface WritingPracticeRecord {
  discussionId: string;
  draft: string;
  updatedAt: string;
  submissions: WritingSubmission[];
}

export interface ListenRepeatPrompt {
  id: string;
  collectionId: string;
  order: number;
  transcript: string;
  audioFile: string | null;
  durationSeconds: number | null;
  tags: string[];
}

export interface ListenRepeatCollection {
  id: string;
  title: string;
  description: string;
  sourceMedia: string | null;
  sourceTitle?: string;
  sequence?: number;
  totalPromptCount?: number;
  prompts: ListenRepeatPrompt[];
}

export interface ListenRepeatLibrary {
  schemaVersion: 1;
  collections: ListenRepeatCollection[];
}

export interface ListenRepeatAttempt {
  id: string;
  promptId: string;
  transcript: string;
  accuracy: number;
  createdAt: string;
}

export type ActivityKind = "vocabulary" | "speaking" | "writing";

export interface StudyActivity {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  createdAt: string;
}

export interface StudySettings {
  learnerName: string;
  targetTestDate: string;
  interviewSeconds: number;
  writingSeconds: number;
  autoSaveWriting: boolean;
  playSounds: boolean;
}

export interface StudyState {
  schemaVersion: 1;
  writing: Record<string, WritingPracticeRecord>;
  listenRepeatAttempts: ListenRepeatAttempt[];
  activities: StudyActivity[];
  settings: StudySettings;
}
