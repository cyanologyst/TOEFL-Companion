import { beforeEach, describe, expect, it } from "vitest";
import { vocabularyRepository } from "./vocabularyRepository";

describe("vocabularyRepository built-in libraries", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("includes the PDF vocabulary as an independent enabled library", () => {
    const snapshot = vocabularyRepository.getSnapshot();
    const neoList = snapshot.wordLists.find((list) => list.id === "toefl-neo-1-10");

    expect(vocabularyRepository.builtInListIds).toEqual(["toefl-550-march-2026", "toefl-neo-1-10"]);
    expect(neoList).toMatchObject({
      title: "TOEFL Vocabulary Neo 1-10",
      language: "en-fa",
      isBuiltIn: true,
      isEnabled: true,
    });
    expect(neoList?.words).toHaveLength(64);
    expect(neoList?.words[0]).toMatchObject({
      term: "Conversely",
      shortMeaning: "برعکس؛ در مقابل",
    });
    expect(neoList?.words[63]).toMatchObject({
      term: "Lithification",
      shortMeaning: "سنگ‌شدگی؛ فرایند تبدیل رسوبات به سنگ رسوبی",
    });
  });

  it("adds newly bundled libraries to an existing user's enabled-list settings", () => {
    window.localStorage.setItem(
      "toefl-companion:vocabulary:v1",
      JSON.stringify({
        schemaVersion: 1,
        settings: vocabularyRepository.getSnapshot().settings,
        progress: {},
        events: [],
        personalWords: [],
        importedLists: [],
        enabledLists: {
          "toefl-550-march-2026": false,
          "personal-words": true,
        },
        pausedUntil: null,
        nextReminderAt: null,
      }),
    );

    const snapshot = vocabularyRepository.getSnapshot();

    expect(snapshot.enabledLists["toefl-550-march-2026"]).toBe(false);
    expect(snapshot.enabledLists["toefl-neo-1-10"]).toBe(true);
  });

  it("creates and edits a user wordlist without changing built-in data", async () => {
    const list = vocabularyRepository.createWordList("Client vocabulary");
    const word = await vocabularyRepository.addWordToList(
      {
        term: "Articulate",
        partOfSpeech: "adjective",
        pronunciation: "/ɑːrˈtɪkjələt/",
        shortMeaning: "توانا در بیان روشن",
        notes: "Use in speaking practice.",
      },
      list.id,
    );

    vocabularyRepository.updateEditableWord(list.id, word.id, {
      term: "Articulate",
      partOfSpeech: "adjective",
      pronunciation: "",
      shortMeaning: "دارای بیان روشن و مؤثر",
      notes: "",
    });

    const updated = vocabularyRepository.getSnapshot();
    const customList = updated.wordLists.find((candidate) => candidate.id === list.id);
    expect(customList).toMatchObject({
      title: "Client vocabulary",
      isBuiltIn: false,
      isEnabled: true,
    });
    expect(customList?.words[0]).toMatchObject({
      id: word.id,
      shortMeaning: "دارای بیان روشن و مؤثر",
      pronunciation: null,
      notes: null,
    });
    expect(updated.wordLists.find((candidate) => candidate.isBuiltIn)?.words).toHaveLength(550);

    vocabularyRepository.deleteEditableWord(list.id, word.id);
    expect(
      vocabularyRepository.getSnapshot().wordLists.find((candidate) => candidate.id === list.id)
        ?.words,
    ).toHaveLength(0);
  });
});
