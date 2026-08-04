import type {
  RecordingDraft,
  RecordingPlayback,
  SavedRecordingMetadata,
  StoredRecording,
} from "../types/toefl";

export const RECORDING_DATABASE_NAME = "toefl-companion-recordings";
export const RECORDING_STORE_NAME = "recordings";
const RECORDING_DATABASE_VERSION = 1;

export type RecordingStorageErrorCode =
  | "unavailable"
  | "blocked"
  | "quota"
  | "missing-draft"
  | "invalid-recording"
  | "read"
  | "write"
  | "delete";

export class RecordingStorageError extends Error {
  readonly code: RecordingStorageErrorCode;

  constructor(code: RecordingStorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RecordingStorageError";
    this.code = code;
  }
}

export interface RecordingRepository {
  /**
   * Keeps a just-recorded Blob available for preview without claiming it is
   * durable. Drafts intentionally remain in memory until Save is selected.
   */
  stageDraft(draft: RecordingDraft): void;
  getDraft(id: string): RecordingDraft | undefined;
  discardDraft(id: string): void;
  persistDraft(id: string): Promise<SavedRecordingMetadata>;
  getRecording(id: string): Promise<StoredRecording | null>;
  createPlayback(id: string): Promise<RecordingPlayback | null>;
  deleteRecording(id: string): Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function describeStorageFailure(
  operation: "open" | "read" | "write" | "delete",
  error: unknown,
): RecordingStorageError {
  if (error instanceof RecordingStorageError) {
    return error;
  }

  const name = error instanceof DOMException ? error.name : "";
  if (name === "QuotaExceededError") {
    return new RecordingStorageError(
      "quota",
      "This device does not have enough app storage for the recording. Free some space and try again.",
      { cause: error },
    );
  }

  if (name === "SecurityError" || name === "InvalidStateError") {
    return new RecordingStorageError(
      "unavailable",
      "Local recording storage is unavailable. Restart TOEFL Companion and try again.",
      { cause: error },
    );
  }

  const messages = {
    open: "TOEFL Companion could not open local recording storage.",
    read: "The saved recording could not be loaded from this device.",
    write: "The recording could not be saved on this device.",
    delete: "The recording could not be removed from this device.",
  } as const;
  const codes = {
    open: "unavailable",
    read: "read",
    write: "write",
    delete: "delete",
  } as const;

  return new RecordingStorageError(codes[operation], messages[operation], {
    cause: error,
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function normalizeStoredRecording(value: unknown): StoredRecording | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !(value.blob instanceof Blob) ||
    value.blob.size === 0 ||
    typeof value.mimeType !== "string" ||
    typeof value.transcript !== "string" ||
    typeof value.durationSeconds !== "number" ||
    !Number.isFinite(value.durationSeconds) ||
    typeof value.size !== "number" ||
    !Number.isFinite(value.size) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  ) {
    return null;
  }

  return {
    id: value.id,
    blob: value.blob,
    mimeType: value.mimeType || value.blob.type || "audio/webm",
    transcript: value.transcript,
    durationSeconds: Math.max(0, value.durationSeconds),
    size: value.blob.size,
    createdAt: new Date(value.createdAt).toISOString(),
  };
}

class IndexedDbRecordingRepository implements RecordingRepository {
  private readonly drafts = new Map<string, RecordingDraft>();
  private readonly playbackUrls = new Map<string, Set<string>>();
  private databasePromise: Promise<IDBDatabase> | null = null;

  stageDraft(draft: RecordingDraft): void {
    if (
      !draft.id ||
      draft.blob.size === 0 ||
      !draft.url ||
      !Number.isFinite(draft.durationSeconds)
    ) {
      throw new RecordingStorageError(
        "invalid-recording",
        "The recording draft is empty or invalid.",
      );
    }

    const previous = this.drafts.get(draft.id);
    if (previous && previous.url !== draft.url) {
      URL.revokeObjectURL(previous.url);
    }
    this.drafts.set(draft.id, draft);
  }

  getDraft(id: string): RecordingDraft | undefined {
    return this.drafts.get(id);
  }

  discardDraft(id: string): void {
    const draft = this.drafts.get(id);
    if (!draft) {
      return;
    }

    URL.revokeObjectURL(draft.url);
    this.drafts.delete(id);
  }

  async persistDraft(id: string): Promise<SavedRecordingMetadata> {
    const draft = this.drafts.get(id);
    if (!draft) {
      throw new RecordingStorageError(
        "missing-draft",
        "The recording draft is no longer available. Record the response again.",
      );
    }

    const record: StoredRecording = {
      id: draft.id,
      blob: draft.blob,
      mimeType: draft.mimeType || draft.blob.type || "audio/webm",
      transcript: draft.transcript,
      durationSeconds: draft.durationSeconds,
      size: draft.blob.size,
      createdAt: draft.createdAt,
    };

    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(RECORDING_STORE_NAME, "readwrite");
      const completion = transactionComplete(transaction);
      transaction.objectStore(RECORDING_STORE_NAME).put(record);
      await completion;
    } catch (error) {
      this.invalidateClosedDatabase(error);
      throw describeStorageFailure("write", error);
    }

    return {
      id: record.id,
      mimeType: record.mimeType,
      transcript: record.transcript,
      durationSeconds: record.durationSeconds,
      size: record.size,
      createdAt: record.createdAt,
      recordingAvailable: true,
    };
  }

  async getRecording(id: string): Promise<StoredRecording | null> {
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(RECORDING_STORE_NAME, "readonly");
      const completion = transactionComplete(transaction);
      const request = transaction.objectStore(RECORDING_STORE_NAME).get(id) as IDBRequest<unknown>;
      const [value] = await Promise.all([requestResult(request), completion]);

      if (value === undefined) {
        return null;
      }

      const recording = normalizeStoredRecording(value);
      if (!recording) {
        throw new RecordingStorageError(
          "invalid-recording",
          "The saved recording is damaged and cannot be played.",
        );
      }
      return recording;
    } catch (error) {
      this.invalidateClosedDatabase(error);
      throw describeStorageFailure("read", error);
    }
  }

  async createPlayback(id: string): Promise<RecordingPlayback | null> {
    const recording = await this.getRecording(id);
    if (!recording) {
      return null;
    }

    const url = URL.createObjectURL(recording.blob);
    const urls = this.playbackUrls.get(id) ?? new Set<string>();
    urls.add(url);
    this.playbackUrls.set(id, urls);
    let released = false;

    return {
      id: recording.id,
      url,
      mimeType: recording.mimeType,
      transcript: recording.transcript,
      durationSeconds: recording.durationSeconds,
      size: recording.size,
      createdAt: recording.createdAt,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        URL.revokeObjectURL(url);
        const currentUrls = this.playbackUrls.get(id);
        currentUrls?.delete(url);
        if (currentUrls?.size === 0) {
          this.playbackUrls.delete(id);
        }
      },
    };
  }

  async deleteRecording(id: string): Promise<void> {
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(RECORDING_STORE_NAME, "readwrite");
      const completion = transactionComplete(transaction);
      transaction.objectStore(RECORDING_STORE_NAME).delete(id);
      await completion;
    } catch (error) {
      this.invalidateClosedDatabase(error);
      throw describeStorageFailure("delete", error);
    }

    this.releasePlaybackUrls(id);
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) {
      return this.databasePromise;
    }

    if (typeof indexedDB === "undefined") {
      return Promise.reject(
        new RecordingStorageError(
          "unavailable",
          "Local recording storage is unavailable in this installation.",
        ),
      );
    }

    const databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      let settled = false;

      const fail = (error: RecordingStorageError) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      try {
        request = indexedDB.open(RECORDING_DATABASE_NAME, RECORDING_DATABASE_VERSION);
      } catch (error) {
        fail(describeStorageFailure("open", error));
        return;
      }

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(RECORDING_STORE_NAME)) {
          database.createObjectStore(RECORDING_STORE_NAME, {
            keyPath: "id",
          });
        }
      };

      request.onblocked = () => {
        fail(
          new RecordingStorageError(
            "blocked",
            "Recording storage is busy in another TOEFL Companion window. Close the other window and try again.",
          ),
        );
      };

      request.onerror = () => {
        fail(describeStorageFailure("open", request.error));
      };

      request.onsuccess = () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }

        settled = true;
        database.onversionchange = () => {
          database.close();
          if (this.databasePromise === databasePromise) {
            this.databasePromise = null;
          }
        };
        resolve(database);
      };
    });

    this.databasePromise = databasePromise;
    void databasePromise.catch(() => {
      if (this.databasePromise === databasePromise) {
        this.databasePromise = null;
      }
    });
    return databasePromise;
  }

  private releasePlaybackUrls(id: string): void {
    const urls = this.playbackUrls.get(id);
    urls?.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.playbackUrls.delete(id);
  }

  private invalidateClosedDatabase(error: unknown): void {
    if (error instanceof DOMException && error.name === "InvalidStateError") {
      // WebView2 may close an IndexedDB connection after a suspend/resume or
      // schema change. Let the next user-initiated retry open a fresh one.
      this.databasePromise = null;
    }
  }
}

/**
 * Audio is intentionally stored in IndexedDB rather than localStorage:
 * IndexedDB can atomically and durably store Blobs in both WebView2 and modern
 * browsers. The in-memory draft remains playable if a save fails, so the
 * learner can free space and retry without recording again.
 */
export const recordingRepository: RecordingRepository = new IndexedDbRecordingRepository();
