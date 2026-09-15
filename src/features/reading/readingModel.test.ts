import { describe, expect, it } from "vitest";
import type { CompleteTheWordsPassage, ReadingPassageRecord } from "../../types/reading";
import {
  emptyLetters,
  filledLetterCount,
  gradePassage,
  matchesFilter,
  matchesQuery,
  nextUnfinished,
  normalizeLetters,
  passageStatus,
  sourceLabel,
} from "./readingModel";

const cats: CompleteTheWordsPassage = {
  id: "cats",
  title: "Cats",
  sources: [1],
  blankCount: 2,
  letterCount: 6,
  parts: [
    "A cat is small. The ",
    { stem: "an", missing: "imal" },
    " sat on ",
    { stem: "T", missing: "he" },
    " mat.",
  ],
};

const checked = {
  checkedAt: "2026-09-15T10:01:00.000Z",
  correctLetters: 6,
  totalLetters: 6,
  correctWords: 2,
  totalWords: 2,
};

function record(overrides: Partial<ReadingPassageRecord> = {}): ReadingPassageRecord {
  return {
    passageId: "cats",
    letters: ["    ", "  "],
    updatedAt: "2026-09-15T10:00:00.000Z",
    lastCheck: null,
    bestCorrectLetters: 0,
    checks: 0,
    revealedAt: null,
    ...overrides,
  };
}

describe("letter boxes", () => {
  it("gives each blank one empty box per hidden letter", () => {
    expect(emptyLetters(cats)).toEqual(["    ", "  "]);
  });

  it("fits stored letters to the passage and drops anything that is not a letter", () => {
    expect(normalizeLetters(cats, ["IM", "h3extra"])).toEqual(["im  ", "h "]);
    expect(normalizeLetters(cats, undefined)).toEqual(["    ", "  "]);
    expect(filledLetterCount(["im  ", "h "])).toBe(3);
  });
});

describe("grading", () => {
  it("marks each missing letter on its own, ignoring case", () => {
    const grade = gradePassage(cats, ["IMAL", "hx"]);

    expect(grade.blanks[0]).toEqual({
      letters: ["correct", "correct", "correct", "correct"],
      correct: true,
    });
    expect(grade.blanks[1]).toEqual({ letters: ["correct", "wrong"], correct: false });
    expect(grade.check).toEqual({
      correctLetters: 5,
      totalLetters: 6,
      correctWords: 1,
      totalWords: 2,
    });
  });

  it("scores an empty box as neither right nor wrong", () => {
    const grade = gradePassage(cats, ["i   ", "  "]);

    expect(grade.blanks[0].letters).toEqual(["correct", "empty", "empty", "empty"]);
    expect(grade.check.correctLetters).toBe(1);
    expect(grade.check.correctWords).toBe(0);
  });
});

describe("the passage pool", () => {
  const pool = [
    { ...cats, id: "a", title: "Tectonic plates" },
    { ...cats, id: "b", title: "Tiger territories" },
    { ...cats, id: "c", title: "Crop rotation" },
  ];

  it("calls a passage done only once it has been checked", () => {
    expect(passageStatus(undefined)).toBe("new");
    expect(passageStatus(record())).toBe("new");
    expect(passageStatus(record({ letters: ["i   ", "  "] }))).toBe("started");
    expect(passageStatus(record({ lastCheck: checked }))).toBe("done");
  });

  it("counts a started passage as still to do", () => {
    expect(matchesFilter("started", "todo")).toBe(true);
    expect(matchesFilter("started", "done")).toBe(false);
    expect(matchesFilter("done", "all")).toBe(true);
  });

  it("finds the next unchecked passage and wraps to the start", () => {
    const done = record({ lastCheck: checked });

    expect(nextUnfinished(pool, {})?.id).toBe("a");
    expect(nextUnfinished(pool, { b: done }, "a")?.id).toBe("c");
    expect(nextUnfinished(pool, { a: done, b: done }, "c")).toBeNull();
    expect(nextUnfinished(pool, { a: done, b: done, c: done })).toBeNull();
  });

  it("searches only what the learner can see, never a hidden answer", () => {
    expect(matchesQuery(cats, "small")).toBe(true);
    expect(matchesQuery(cats, "The an")).toBe(true);
    expect(matchesQuery(cats, "animal")).toBe(false);
    expect(matchesQuery(cats, "cats")).toBe(true);
  });

  it("names the tests a passage came from", () => {
    expect(sourceLabel([1])).toBe("Neo 01");
    expect(sourceLabel([21, 34])).toBe("Neo 21 · also Neo 34");
  });
});
