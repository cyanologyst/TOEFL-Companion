// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RecordingDraft } from "../types/toefl";
import { RecordingStorageError, recordingRepository } from "./recordingRepository";

const createdUrls: string[] = [];
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const revokeObjectUrl = vi.fn();

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => {
      const url = `blob:test-${createdUrls.length + 1}`;
      createdUrls.push(url);
      return url;
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectUrl,
  });
});

afterAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: originalRevokeObjectUrl,
  });
});

function draft(id: string): RecordingDraft {
  const blob = new Blob([`audio-${id}`], { type: "audio/webm" });
  return {
    id,
    blob,
    url: `blob:draft-${id}`,
    mimeType: "audio/webm",
    transcript: "A concise practice response.",
    durationSeconds: 12,
    size: blob.size,
    createdAt: "2026-07-26T12:00:00.000Z",
  };
}

describe("recordingRepository", () => {
  it("rejects invalid drafts and missing saves with actionable typed errors", async () => {
    expect(() =>
      recordingRepository.stageDraft({
        ...draft("empty"),
        blob: new Blob([]),
        size: 0,
      }),
    ).toThrow(RecordingStorageError);

    await expect(recordingRepository.persistDraft("does-not-exist")).rejects.toMatchObject({
      name: "RecordingStorageError",
      code: "missing-draft",
    });
  });

  it("persists, reloads, plays, releases, and deletes an audio Blob", async () => {
    const id = `recording-${crypto.randomUUID()}`;
    const staged = draft(id);
    recordingRepository.stageDraft(staged);

    expect(recordingRepository.getDraft(id)).toEqual(staged);

    const saved = await recordingRepository.persistDraft(id);
    expect(saved).toMatchObject({
      id,
      recordingAvailable: true,
      mimeType: "audio/webm",
      transcript: staged.transcript,
      durationSeconds: 12,
      size: staged.blob.size,
    });

    const stored = await recordingRepository.getRecording(id);
    expect(stored).not.toBeNull();
    expect(stored).toMatchObject({
      id,
      mimeType: "audio/webm",
      transcript: staged.transcript,
      size: staged.blob.size,
    });
    expect(await stored!.blob.text()).toBe(`audio-${id}`);

    const playback = await recordingRepository.createPlayback(id);
    expect(playback).toMatchObject({
      id,
      url: expect.stringMatching(/^blob:test-/),
      mimeType: "audio/webm",
    });
    playback!.release();
    playback!.release();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);

    recordingRepository.discardDraft(id);
    expect(recordingRepository.getDraft(id)).toBeUndefined();
    expect(revokeObjectUrl).toHaveBeenCalledWith(staged.url);

    await recordingRepository.deleteRecording(id);
    expect(await recordingRepository.getRecording(id)).toBeNull();
  });
});
