export interface Question {
  prompt: string;
  plan: string;
  ideas: string[];
  collocations: string[];
  answer: string;
  answer2: string;
}

export interface Topic {
  id: number;
  title: string;
  category: string;
  questions: Question[];
}

export type WorkspaceArea =
  | "home"
  | "practice"
  | "vocabulary"
  | "progress"
  | "saved"
  | "history"
  | "settings"
  | "help";

export interface AttemptHistoryItem {
  id: string;
  topicId: number;
  questionIndex: number;
  createdAt: string;
  durationSeconds: number;
  wordCount: number;
  /** Prompt text captured at save time so history survives later content edits. */
  promptSnapshot?: string;
  /** Optional learner-authored notes for the attempt. */
  notes?: string;
  /**
   * Whether playable audio is durably available. Legacy attempts only stored
   * metadata and are hydrated with this set to false.
   */
  recordingAvailable?: boolean;
  recordingId?: string;
  mimeType?: string;
  size?: number;
}

export interface RecordingMetadata {
  id: string;
  mimeType: string;
  transcript: string;
  durationSeconds: number;
  size: number;
  createdAt: string;
}

export interface RecordingDraft extends RecordingMetadata {
  blob: Blob;
  url: string;
}

/**
 * The playable, unsaved result shown immediately after MediaRecorder stops.
 * Its blob URL is intentionally ephemeral and must never be written to
 * history or local storage.
 */
export interface RecordingCompletion extends RecordingMetadata {
  url: string;
}

/** Metadata emitted only after the audio Blob is committed to IndexedDB. */
export interface SavedRecordingMetadata extends RecordingMetadata {
  recordingAvailable: true;
}

export interface StoredRecording extends RecordingMetadata {
  blob: Blob;
}

export interface RecordingPlayback extends RecordingCompletion {
  release: () => void;
}

export type RecorderPhase =
  | "idle"
  | "requesting"
  | "preparing"
  | "recording"
  | "completed"
  | "failed"
  | "retrying"
  | "saving"
  | "saved";
