import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import rawListenRepeat from "../../src/data/listen-repeat.json";
import type { ListenRepeatLibrary } from "../../src/types/study";

const library = rawListenRepeat as ListenRepeatLibrary;

describe("Listen & Repeat source library", () => {
  it("contains all 50 source scenarios and 347 usable prompts in source order", () => {
    const promptCounts = library.collections.map((collection) => collection.prompts.length);

    expect(library.collections).toHaveLength(50);
    expect(library.collections.map((collection) => collection.sequence)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect(promptCounts.filter((count) => count === 7)).toHaveLength(47);
    expect(promptCounts.filter((count) => count === 6)).toHaveLength(3);
    expect(
      library.collections
        .filter((collection) => collection.prompts.length === 6)
        .map((collection) => collection.sequence),
    ).toEqual([21, 26, 31]);
    expect(library.collections.flatMap((collection) => collection.prompts)).toHaveLength(347);
  });

  it("links every prompt to a unique, non-empty local source-audio clip", () => {
    const prompts = library.collections.flatMap((collection) => collection.prompts);

    expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(prompts.length);
    for (const prompt of prompts) {
      expect(prompt.transcript.trim().length).toBeGreaterThan(0);
      expect(prompt.audioFile).toMatch(/^\/assets\/speaking\/listen-repeat\/.+\.mp3$/u);
      expect(prompt.durationSeconds).toBeGreaterThan(0);
      expect(prompt.durationSeconds).toBeLessThanOrEqual(15);
      expect(existsSync(join(process.cwd(), "public", prompt.audioFile!.slice(1)))).toBe(true);
    }
  });

  it("keeps prompt order and collection references internally consistent", () => {
    for (const collection of library.collections) {
      expect(collection.totalPromptCount).toBe(collection.prompts.length);
      expect(collection.prompts.map((prompt) => prompt.order)).toEqual(
        Array.from({ length: collection.prompts.length }, (_, index) => index + 1),
      );
      expect(collection.prompts.every((prompt) => prompt.collectionId === collection.id)).toBe(
        true,
      );
    }
  });
});
