import { describe, expect, it } from "vitest";
import rawLibrary from "../../src/data/reading-complete-words.json";
import type { CompleteTheWordsLibrary, ReadingBlank } from "../../src/types/reading";

const library = rawLibrary as CompleteTheWordsLibrary;
const blanks = (parts: CompleteTheWordsLibrary["passages"][number]["parts"]) =>
  parts.filter((part): part is ReadingBlank => typeof part !== "string");
const visible = (parts: CompleteTheWordsLibrary["passages"][number]["parts"]) =>
  parts.map((part) => (typeof part === "string" ? part : part.stem)).join("");

describe("Complete the Words library", () => {
  it("holds every unique passage from the 40 NEO tests", () => {
    // 40 tests x 3 passages, less the Ancient Rome passage printed in both 21 and 34.
    expect(library.passages).toHaveLength(119);
    const sourcesSeen = new Set(library.passages.flatMap((passage) => passage.sources));
    for (let test = 1; test <= 40; test += 1) {
      expect(sourcesSeen.has(test)).toBe(true);
    }
    expect(library.passages.flatMap((passage) => passage.sources)).toHaveLength(120);
  });

  it("never repeats a passage, an id, or a title", () => {
    const ids = library.passages.map((passage) => passage.id);
    const titles = library.passages.map((passage) => passage.title);
    const texts = library.passages.map((passage) => visible(passage.parts).toLocaleLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("gives every passage ten blanks whose counts match the parts", () => {
    for (const passage of library.passages) {
      const passageBlanks = blanks(passage.parts);
      expect(passageBlanks, passage.id).toHaveLength(10);
      expect(passage.blankCount, passage.id).toBe(passageBlanks.length);
      expect(passage.letterCount, passage.id).toBe(
        passageBlanks.reduce((sum, blank) => sum + blank.missing.length, 0),
      );
    }
  });

  it("hides only lowercase letters behind a visible stem", () => {
    for (const passage of library.passages) {
      for (const blank of blanks(passage.parts)) {
        expect(blank.stem, passage.id).toMatch(/^\p{L}+$/u);
        expect(blank.missing, `${passage.id} ${blank.stem}`).toMatch(/^[a-z]+$/);
      }
    }
  });

  it("opens every passage with a sentence left whole, as the exam does", () => {
    for (const passage of library.passages) {
      const [first] = passage.parts;
      expect(typeof first, passage.id).toBe("string");
      expect((first as string).trim().length, passage.id).toBeGreaterThan(10);
    }
  });
});
