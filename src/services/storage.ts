export type PersistenceErrorCode =
  | "STORAGE_READ_FAILED"
  | "STORAGE_PARSE_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_BACKUP";

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;

  constructor(message: string, code: PersistenceErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = "PersistenceError";
    this.code = code;
  }
}

export class StorageReadError extends PersistenceError {
  readonly key: string;

  constructor(key: string, cause?: unknown) {
    super("TOEFL Companion could not read data saved on this device.", "STORAGE_READ_FAILED", {
      cause,
    });
    this.name = "StorageReadError";
    this.key = key;
  }
}

export class StorageParseError extends PersistenceError {
  readonly key: string;

  constructor(key: string, cause?: unknown) {
    super(
      "Some saved data is damaged and could not be read. It was left unchanged.",
      "STORAGE_PARSE_FAILED",
      { cause },
    );
    this.name = "StorageParseError";
    this.key = key;
  }
}

export class StorageWriteError extends PersistenceError {
  readonly key: string;
  readonly rollbackFailed: boolean;

  constructor(key: string, cause?: unknown, options: { rollbackFailed?: boolean } = {}) {
    super(
      options.rollbackFailed
        ? "TOEFL Companion could not save all changes, and the previous data could not be fully restored. Export a backup before continuing."
        : "TOEFL Companion could not save changes on this device. Check available storage and app permissions, then try again.",
      "STORAGE_WRITE_FAILED",
      { cause },
    );
    this.name = "StorageWriteError";
    this.key = key;
    this.rollbackFailed = options.rollbackFailed ?? false;
  }
}

export class UnsupportedSchemaVersionError extends PersistenceError {
  readonly scope: string;
  readonly actualVersion: unknown;
  readonly supportedVersion: number;

  constructor(scope: string, actualVersion: unknown, supportedVersion: number) {
    super(
      `This ${scope} was created by a newer version of TOEFL Companion (version ${String(
        actualVersion,
      )}). Update the app before opening it. Your existing data was left unchanged.`,
      "UNSUPPORTED_SCHEMA_VERSION",
    );
    this.name = "UnsupportedSchemaVersionError";
    this.scope = scope;
    this.actualVersion = actualVersion;
    this.supportedVersion = supportedVersion;
  }
}

export class InvalidBackupError extends PersistenceError {
  readonly path: string | null;

  constructor(message: string, path: string | null = null, cause?: unknown) {
    super(message, "INVALID_BACKUP", { cause });
    this.name = "InvalidBackupError";
    this.path = path;
  }
}

function getLocalStorage(key: string, operation: "read" | "write"): Storage {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      throw new Error("localStorage is unavailable");
    }
    return storage;
  } catch (error) {
    if (operation === "write") {
      throw new StorageWriteError(key, error);
    }
    throw new StorageReadError(key, error);
  }
}

export function readStorageText(key: string): string | null {
  const storage = getLocalStorage(key, "read");
  try {
    return storage.getItem(key);
  } catch (error) {
    throw new StorageReadError(key, error);
  }
}

export function readJsonValue(key: string): unknown {
  const serialized = readStorageText(key);
  if (serialized === null) {
    return undefined;
  }

  try {
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new StorageParseError(key, error);
  }
}

function serializeForStorage(key: string, value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("The value cannot be serialized as JSON.");
    }
    return serialized;
  } catch (error) {
    throw new StorageWriteError(key, error);
  }
}

/**
 * Writes a group of JSON values as one best-effort transaction. Every value is
 * serialized and every previous value is captured before the first mutation.
 * If a write fails, already-written keys are restored before the typed error is
 * surfaced to the caller.
 */
export function writeJsonTransaction(
  entries: ReadonlyArray<readonly [key: string, value: unknown]>,
): void {
  if (!entries.length) {
    return;
  }

  const seenKeys = new Set<string>();
  const serializedEntries = entries.map(([key, value]) => {
    if (seenKeys.has(key)) {
      throw new StorageWriteError(
        key,
        new Error("A storage transaction cannot contain duplicate keys."),
      );
    }
    seenKeys.add(key);
    return [key, serializeForStorage(key, value)] as const;
  });

  const storage = getLocalStorage(serializedEntries[0][0], "write");
  const previousValues = new Map<string, string | null>();
  try {
    for (const [key] of serializedEntries) {
      previousValues.set(key, storage.getItem(key));
    }
  } catch (error) {
    throw new StorageReadError(serializedEntries[0][0], error);
  }

  const writtenKeys: string[] = [];
  for (const [key, value] of serializedEntries) {
    try {
      storage.setItem(key, value);
      writtenKeys.push(key);
    } catch (error) {
      let rollbackFailed = false;
      for (const writtenKey of writtenKeys.reverse()) {
        try {
          const previous = previousValues.get(writtenKey);
          if (previous === null || previous === undefined) {
            storage.removeItem(writtenKey);
          } else {
            storage.setItem(writtenKey, previous);
          }
        } catch {
          rollbackFailed = true;
        }
      }
      throw new StorageWriteError(key, error, { rollbackFailed });
    }
  }
}

export function writeJsonValue(key: string, value: unknown): void {
  writeJsonTransaction([[key, value]]);
}

export function dispatchLocalChange(eventName: string): void {
  if (
    typeof globalThis.dispatchEvent === "function" &&
    typeof globalThis.CustomEvent === "function"
  ) {
    globalThis.dispatchEvent(new CustomEvent(eventName));
  }
}
