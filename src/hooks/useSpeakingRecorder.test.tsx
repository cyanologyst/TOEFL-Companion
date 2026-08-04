import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedRecordingMetadata } from "../types/toefl";
import { RecordingStorageError } from "../services/recordingRepository";
import { useSpeakingRecorder } from "./useSpeakingRecorder";

const repositoryMocks = vi.hoisted(() => ({
  stageDraft: vi.fn(),
  getDraft: vi.fn(),
  discardDraft: vi.fn(),
  persistDraft: vi.fn(),
  getRecording: vi.fn(),
  createPlayback: vi.fn(),
  deleteRecording: vi.fn(),
}));

vi.mock("../services/recordingRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/recordingRepository")>();
  return {
    ...actual,
    recordingRepository: repositoryMocks,
  };
});

class MockMediaRecorder {
  static isTypeSupported(): boolean {
    return true;
  }

  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["recorded audio"], { type: this.mimeType }),
    } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

const stopTrack = vi.fn();
const stream = {
  getTracks: () => [{ stop: stopTrack, onended: null }],
  getAudioTracks: () => [{ stop: stopTrack, onended: null }],
} as unknown as MediaStream;

function metadata(id: string): SavedRecordingMetadata {
  return {
    id,
    mimeType: "audio/webm",
    transcript: "",
    durationSeconds: 1,
    size: 14,
    createdAt: "2026-07-26T12:00:00.000Z",
    recordingAvailable: true,
  };
}

async function completeOneRecording(onSave: (result: SavedRecordingMetadata) => void) {
  const hook = renderHook(() => useSpeakingRecorder({ maxSeconds: 45, onSave }));

  await act(async () => {
    await hook.result.current.start();
  });
  expect(hook.result.current.phase).toBe("preparing");

  act(() => {
    vi.advanceTimersByTime(3_000);
  });
  expect(hook.result.current.phase).toBe("recording");

  act(() => {
    hook.result.current.stop();
  });
  expect(hook.result.current.phase).toBe("completed");
  expect(hook.result.current.result).not.toBeNull();

  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: MockMediaRecorder,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    },
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:recording-draft"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });

  repositoryMocks.stageDraft.mockImplementation(() => undefined);
  repositoryMocks.discardDraft.mockImplementation(() => undefined);
  repositoryMocks.persistDraft.mockImplementation(async (id: string) => metadata(id));
  repositoryMocks.deleteRecording.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();

  if (mediaDevicesDescriptor) {
    Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "mediaDevices");
  }
  if (createObjectUrlDescriptor) {
    Object.defineProperty(URL, "createObjectURL", createObjectUrlDescriptor);
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }
  if (revokeObjectUrlDescriptor) {
    Object.defineProperty(URL, "revokeObjectURL", revokeObjectUrlDescriptor);
  } else {
    Reflect.deleteProperty(URL, "revokeObjectURL");
  }
  Reflect.deleteProperty(globalThis, "MediaRecorder");
});

describe("useSpeakingRecorder save lifecycle", () => {
  it("starts immediately when a task has no preparation time", async () => {
    const hook = renderHook(() =>
      useSpeakingRecorder({ maxSeconds: 8, preparationSeconds: 0, onSave: vi.fn() }),
    );

    await act(async () => {
      await hook.result.current.start();
    });

    expect(hook.result.current.phase).toBe("recording");
    expect(hook.result.current.countdown).toBe(0);
    expect(hook.result.current.secondsLeft).toBe(8);

    act(() => {
      hook.result.current.stop();
    });
  });

  it("keeps a completed take as a draft until the learner explicitly saves", async () => {
    const onSave = vi.fn();
    const hook = await completeOneRecording(onSave);
    const draft = hook.result.current.result!;

    expect(repositoryMocks.stageDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: draft.id,
        blob: expect.any(Blob),
        url: draft.url,
      }),
    );
    expect(repositoryMocks.persistDraft).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await hook.result.current.save();
    });

    expect(repositoryMocks.persistDraft).toHaveBeenCalledWith(draft.id);
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: draft.id,
        recordingAvailable: true,
      }),
    );
    expect(hook.result.current.phase).toBe("saved");
  });

  it("retains the playable draft and save actions after storage fails", async () => {
    const onSave = vi.fn();
    const hook = await completeOneRecording(onSave);
    const draft = hook.result.current.result!;
    repositoryMocks.persistDraft.mockRejectedValueOnce(
      new RecordingStorageError(
        "quota",
        "This device does not have enough app storage for the recording.",
      ),
    );

    await act(async () => {
      await hook.result.current.save();
    });

    expect(hook.result.current.phase).toBe("failed");
    expect(hook.result.current.failureKind).toBe("storage");
    expect(hook.result.current.result).toEqual(draft);
    expect(hook.result.current.pendingAction).toBeNull();
    expect(repositoryMocks.discardDraft).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();

    repositoryMocks.persistDraft.mockResolvedValueOnce(metadata(draft.id));
    await act(async () => {
      await hook.result.current.save();
    });

    expect(repositoryMocks.persistDraft).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenCalledOnce();
    expect(hook.result.current.phase).toBe("saved");
  });
});
