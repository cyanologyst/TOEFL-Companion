import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StorageParseError,
  StorageReadError,
  StorageWriteError,
  readJsonValue,
  writeJsonTransaction,
  writeJsonValue,
} from "./storage";

class ControllableStorage implements Storage {
  private readonly values = new Map<string, string>();
  failGetFor: string | null = null;
  failSetFor: string | null = null;
  failRemoveFor: string | null = null;

  constructor(initial: Record<string, string> = {}) {
    Object.entries(initial).forEach(([key, value]) => {
      this.values.set(key, value);
    });
  }

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    if (this.failGetFor === key) {
      throw new DOMException("Read denied", "SecurityError");
    }
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    if (this.failRemoveFor === key) {
      throw new DOMException("Remove denied", "QuotaExceededError");
    }
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failSetFor === key) {
      throw new DOMException("Storage full", "QuotaExceededError");
    }
    this.values.set(key, String(value));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("typed storage errors", () => {
  it("reports malformed JSON without deleting the damaged value", () => {
    const storage = new ControllableStorage({ settings: "{broken" });
    vi.stubGlobal("localStorage", storage);

    expect(() => readJsonValue("settings")).toThrow(StorageParseError);
    expect(storage.getItem("settings")).toBe("{broken");
  });

  it("reports read failures with their key", () => {
    const storage = new ControllableStorage();
    storage.failGetFor = "history";
    vi.stubGlobal("localStorage", storage);

    let error: unknown;
    try {
      readJsonValue("history");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(StorageReadError);
    expect(error).toMatchObject({
      code: "STORAGE_READ_FAILED",
      key: "history",
    });
  });

  it("wraps serialization failures as a StorageWriteError", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(() => writeJsonValue("circular", circular)).toThrow(StorageWriteError);
  });
});

describe("transaction rollback", () => {
  it("restores prior values when a later write fails", () => {
    const storage = new ControllableStorage({
      first: JSON.stringify({ value: "old-first" }),
      second: JSON.stringify({ value: "old-second" }),
    });
    storage.failSetFor = "second";
    vi.stubGlobal("localStorage", storage);

    let error: unknown;
    try {
      writeJsonTransaction([
        ["first", { value: "new-first" }],
        ["second", { value: "new-second" }],
      ]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(StorageWriteError);
    expect(error).toMatchObject({
      code: "STORAGE_WRITE_FAILED",
      key: "second",
      rollbackFailed: false,
    });
    expect(JSON.parse(storage.getItem("first")!)).toEqual({
      value: "old-first",
    });
    expect(JSON.parse(storage.getItem("second")!)).toEqual({
      value: "old-second",
    });
  });

  it("removes newly-created keys during rollback", () => {
    const storage = new ControllableStorage();
    storage.failSetFor = "second";
    vi.stubGlobal("localStorage", storage);

    expect(() =>
      writeJsonTransaction([
        ["first", { created: true }],
        ["second", { created: true }],
      ]),
    ).toThrow(StorageWriteError);

    expect(storage.getItem("first")).toBeNull();
    expect(storage.getItem("second")).toBeNull();
  });

  it("rejects duplicate keys before mutating storage", () => {
    const storage = new ControllableStorage({
      repeated: JSON.stringify("original"),
    });
    vi.stubGlobal("localStorage", storage);

    expect(() =>
      writeJsonTransaction([
        ["repeated", "first"],
        ["repeated", "second"],
      ]),
    ).toThrow(StorageWriteError);

    expect(JSON.parse(storage.getItem("repeated")!)).toBe("original");
  });
});
