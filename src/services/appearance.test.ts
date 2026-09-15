import { beforeEach, describe, expect, it } from "vitest";
import { APPEARANCE_STORAGE_KEY, appearanceRepository, THEME_OPTIONS } from "./appearance";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("appearance", () => {
  it("starts on TOEFL Indigo with the rail open on wide windows and folded on narrow ones", () => {
    expect(appearanceRepository.get()).toEqual({
      theme: "indigo",
      railCollapsed: false,
      railOpenNarrow: false,
    });
  });

  it("applies a theme to the document at once and remembers it", () => {
    appearanceRepository.update({ theme: "night" });

    expect(document.documentElement.dataset.theme).toBe("night");
    expect(appearanceRepository.get().theme).toBe("night");
  });

  it("falls back to the default when storage holds a theme that no longer exists", () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ theme: "neon", railCollapsed: "yes" }),
    );

    expect(appearanceRepository.get()).toEqual({
      theme: "indigo",
      railCollapsed: false,
      railOpenNarrow: false,
    });
  });

  it("keeps the rail's wide and narrow states apart", () => {
    appearanceRepository.update({ railCollapsed: true });
    appearanceRepository.update({ railOpenNarrow: true });

    expect(appearanceRepository.get()).toMatchObject({ railCollapsed: true, railOpenNarrow: true });
  });

  it("offers every theme the stylesheet defines, and nothing else", () => {
    expect(THEME_OPTIONS.map((option) => option.id)).toEqual([
      "indigo",
      "night",
      "teal",
      "sunshine",
      "paper",
    ]);
  });
});
