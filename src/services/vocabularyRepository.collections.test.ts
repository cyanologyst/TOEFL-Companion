import { beforeEach, describe, expect, it } from "vitest";
import { vocabularyRepository } from "./vocabularyRepository";

const { personalListId, builtInListId } = vocabularyRepository;

/* A made-up term, with a meaning and pronunciation supplied, so adding it never
   collides with a built-in word or reaches for the online dictionary. */
function draft(term = "zzcollectiontest") {
  return { term, shortMeaning: "A test word.", pronunciation: "/test/" };
}

function listById(id: string) {
  return vocabularyRepository.getSnapshot().wordLists.find((list) => list.id === id);
}

describe("vocabulary collections", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("gives every collection a colour, and a new one the first colour nobody wears", () => {
    const before = vocabularyRepository.getSnapshot().wordLists;
    expect(before.every((list) => list.color)).toBe(true);

    const created = vocabularyRepository.createWordList("Environment");

    expect(before.map((list) => list.color)).not.toContain(created.color);
    expect(listById(created.id)?.color).toBe(created.color);
  });

  it("refuses a blank name or one that is already taken", () => {
    vocabularyRepository.createWordList("Environment");

    expect(() => vocabularyRepository.createWordList("   ")).toThrow(/name/);
    expect(() => vocabularyRepository.createWordList("environment")).toThrow(/already/);
  });

  it("renames the learner's collections, Personal included, but not the built-ins", () => {
    const created = vocabularyRepository.createWordList("Envirnoment");

    vocabularyRepository.renameWordList(created.id, "Environment");
    vocabularyRepository.renameWordList(personalListId, "My words");

    expect(listById(created.id)?.title).toBe("Environment");
    expect(listById(personalListId)?.title).toBe("My words");
    expect(() => vocabularyRepository.renameWordList(builtInListId, "Mine")).toThrow(/Built-in/);
  });

  it("recolours a collection and rejects a colour outside the palette", () => {
    const created = vocabularyRepository.createWordList("Environment");

    vocabularyRepository.setListColor(created.id, "flame");

    expect(listById(created.id)?.color).toBe("flame");
    expect(() => vocabularyRepository.setListColor(created.id, "teal" as never)).toThrow();
  });

  it("moves a word between the learner's collections and keeps its id", async () => {
    const created = vocabularyRepository.createWordList("Environment");
    const word = await vocabularyRepository.addWordToList(draft(), personalListId);

    const moved = vocabularyRepository.moveWord(word.id, created.id);

    expect(moved.word.id).toBe(word.id);
    expect(moved.list.id).toBe(created.id);
    expect(moved.word.tags).toEqual(["Custom"]);
    expect(listById(personalListId)?.words).toHaveLength(0);
    expect(() => vocabularyRepository.moveWord(word.id, builtInListId)).toThrow();
  });

  it("keeps a deleted collection's words in another collection when asked", async () => {
    const created = vocabularyRepository.createWordList("Environment");
    const word = await vocabularyRepository.addWordToList(draft(), created.id);

    vocabularyRepository.deleteWordList(created.id, personalListId);

    expect(listById(created.id)).toBeUndefined();
    expect(vocabularyRepository.findWord(word.id)?.list.id).toBe(personalListId);
    expect(vocabularyRepository.findWord(word.id)?.word.tags).toEqual(["Personal"]);
  });

  it("deletes a collection's words with it otherwise, and never deletes Personal", async () => {
    const created = vocabularyRepository.createWordList("Environment");
    const word = await vocabularyRepository.addWordToList(draft(), created.id);

    vocabularyRepository.deleteWordList(created.id);

    expect(vocabularyRepository.findWord(word.id)).toBeNull();
    expect(() => vocabularyRepository.deleteWordList(personalListId)).toThrow();
  });

  it("opens a store saved before collections had colours or could be renamed", () => {
    const { settings } = vocabularyRepository.getSnapshot();
    window.localStorage.setItem(
      "toefl-companion:vocabulary:v1",
      JSON.stringify({
        schemaVersion: 1,
        settings,
        progress: {},
        events: [],
        personalWords: [],
        importedLists: [
          {
            schemaVersion: 1,
            id: "custom-old",
            title: "Old list",
            language: "en",
            source: null,
            words: [],
            isEnabled: true,
            isBuiltIn: false,
          },
        ],
        enabledLists: {},
        pausedUntil: null,
        nextReminderAt: null,
      }),
    );

    expect(listById(personalListId)?.title).toBe("Personal words");
    expect(listById("custom-old")?.color).toBeTruthy();
  });
});
