import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatCountLabel,
  formatDuration,
  formatPercentage,
  pluralize,
} from "./format";

describe("count formatting", () => {
  it.each([
    [0, "questions"],
    [1, "question"],
    [2, "questions"],
    [-1, "question"],
  ])("pluralizes %s with English plural rules", (count, expected) => {
    expect(pluralize(count, "question")).toBe(expected);
  });

  it("supports irregular nouns and locale number grouping", () => {
    expect(formatCount(1, "response", "responses")).toBe("1 response");
    expect(formatCount(2, "response", "responses")).toBe("2 responses");
    expect(formatCountLabel(1_250, { one: "word", other: "words" })).toMatch(/^1[,\s]250 words$/);
  });
});

describe("no-data formatting", () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "renders missing percentage %s as an em dash",
    (value) => {
      expect(formatPercentage(value)).toBe("—");
    },
  );

  it("distinguishes a measured zero from no data", () => {
    expect(formatPercentage(0, true)).toBe("0%");
    expect(formatPercentage(0, false)).toBe("—");
  });

  it("does not invent a duration when no valid duration exists", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(90)).toBe("1 min 30 sec");
  });
});
