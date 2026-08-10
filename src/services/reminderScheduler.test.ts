import { describe, expect, it } from "vitest";
import { DEFAULT_VOCABULARY_SETTINGS } from "../types/vocabulary";
import type { VocabularySettings, WordEntry, WordList } from "../types/vocabulary";
import { chooseReminderWord, decideReminder, reminderCandidates } from "./reminderScheduler";
import type { VocabularySnapshot } from "./vocabularyRepository";

function word(id: string, term = id): WordEntry {
  return {
    id,
    term,
    partOfSpeech: null,
    pronunciation: null,
    shortMeaning: "meaning",
    chapter: null,
    order: null,
    tags: [],
    exampleSentences: [],
    synonyms: [],
    antonyms: [],
    notes: null,
    difficulty: 3,
    enrichmentSource: null,
  };
}

function list(id: string, isEnabled: boolean, words: WordEntry[]): WordList {
  return {
    schemaVersion: 1,
    id,
    title: id,
    language: "en",
    source: null,
    words,
    isEnabled,
    isBuiltIn: false,
  };
}

const NOW = Date.parse("2026-08-10T12:00:00.000Z");

function snapshot(overrides: Partial<VocabularySnapshot> = {}): VocabularySnapshot {
  const settings: VocabularySettings = {
    ...DEFAULT_VOCABULARY_SETTINGS,
    notificationMode: "popup",
    quietHoursEnabled: false,
    reminderIntervalMinutes: 30,
    ...(overrides.settings ?? {}),
  };
  const { settings: _ignored, ...rest } = overrides;
  return {
    wordLists: [list("on", true, [word("a"), word("b")]), list("off", false, [word("c")])],
    progress: {},
    events: [],
    nextReminderAt: new Date(NOW - 1_000).toISOString(),
    pausedUntil: null,
    ...rest,
    settings,
  } as VocabularySnapshot;
}

const base = {
  nowMs: NOW,
  showing: false,
  interruptible: true,
  lastWordId: null,
  random: () => 0,
};

describe("reminder scheduling", () => {
  it("draws only from collections that are switched on", () => {
    const candidates = reminderCandidates(snapshot());
    expect(candidates.map((entry) => entry.word.id)).toEqual(["a", "b"]);
  });

  it("fires a word from an enabled collection when one is due", () => {
    const decision = decideReminder({ ...base, snapshot: snapshot() });
    expect(decision.kind).toBe("fire");
    if (decision.kind === "fire") {
      expect(decision.location.list.id).toBe("on");
      expect(decision.nextAt).not.toBeNull();
    }
  });

  it("stops scheduling entirely when every collection is switched off", () => {
    const none = snapshot({
      wordLists: [list("off", false, [word("c")])],
    });
    const decision = decideReminder({ ...base, snapshot: none });
    expect(decision).toEqual({ kind: "schedule", at: null });
  });

  it("defers rather than skipping when the learner is mid-task", () => {
    const decision = decideReminder({ ...base, snapshot: snapshot(), interruptible: false });
    expect(decision.kind).toBe("defer");
    if (decision.kind === "defer") {
      expect(Date.parse(decision.at)).toBeGreaterThan(NOW);
    }
  });

  it("holds the card back while the window is hidden", () => {
    const decision = decideReminder({ ...base, snapshot: snapshot(), visible: false });
    expect(decision.kind).toBe("defer");
    if (decision.kind === "defer") {
      expect(decision.reason).toBe("hidden");
    }
  });

  it("still fires when hidden if only system notifications are used", () => {
    const systemOnly = snapshot({
      settings: {
        ...DEFAULT_VOCABULARY_SETTINGS,
        notificationMode: "system",
        quietHoursEnabled: false,
      } as VocabularySettings,
    });
    expect(decideReminder({ ...base, snapshot: systemOnly, visible: false }).kind).toBe("fire");
  });

  it("waits while a card is already on screen", () => {
    expect(decideReminder({ ...base, snapshot: snapshot(), showing: true })).toEqual({
      kind: "wait",
    });
  });

  it("waits while reminders are paused", () => {
    const paused = snapshot({ pausedUntil: new Date(NOW + 60_000).toISOString() });
    expect(decideReminder({ ...base, snapshot: paused })).toEqual({ kind: "wait" });
  });

  it("waits until the scheduled time arrives", () => {
    const later = snapshot({ nextReminderAt: new Date(NOW + 60_000).toISOString() });
    expect(decideReminder({ ...base, snapshot: later })).toEqual({ kind: "wait" });
  });

  it("reschedules past quiet hours instead of firing inside them", () => {
    const quiet = snapshot({
      settings: {
        ...DEFAULT_VOCABULARY_SETTINGS,
        notificationMode: "popup",
        quietHoursEnabled: true,
        quietHoursStart: "00:00",
        quietHoursEnd: "23:59",
      } as VocabularySettings,
    });
    const decision = decideReminder({ ...base, snapshot: quiet });
    expect(decision.kind).toBe("schedule");
    if (decision.kind === "schedule") {
      expect(decision.at).not.toBeNull();
    }
  });

  it("does not offer the same word twice in a row", () => {
    const chosen = chooseReminderWord(snapshot(), NOW, "a", () => 0);
    expect(chosen?.word.id).toBe("b");
  });

  it("repeats the only enabled word rather than going silent", () => {
    const single = snapshot({ wordLists: [list("on", true, [word("a")])] });
    expect(chooseReminderWord(single, NOW, "a", () => 0)?.word.id).toBe("a");
  });
});
