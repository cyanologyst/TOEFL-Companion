import rawLibrary from "../../data/reading-complete-words.json";
import type {
  CompleteTheWordsLibrary,
  CompleteTheWordsPassage,
  ReadingBlank,
  ReadingCheck,
  ReadingPassageRecord,
} from "../../types/reading";

export const completeTheWords = rawLibrary as CompleteTheWordsLibrary;

/** What an untouched letter box holds. */
export const EMPTY_LETTER = " ";

export type LetterState = "empty" | "correct" | "wrong";
export type PassageStatus = "new" | "started" | "done";
export type PassageFilter = "all" | "todo" | "done";

export interface BlankResult {
  letters: LetterState[];
  correct: boolean;
}

export interface PassageGrade {
  blanks: BlankResult[];
  check: Omit<ReadingCheck, "checkedAt">;
}

export function blanksOf(passage: CompleteTheWordsPassage): ReadingBlank[] {
  return passage.parts.filter((part): part is ReadingBlank => typeof part !== "string");
}

export function totalLettersOf(passage: CompleteTheWordsPassage): number {
  return blanksOf(passage).reduce((sum, blank) => sum + blank.missing.length, 0);
}

export function emptyLetters(passage: CompleteTheWordsPassage): string[] {
  return blanksOf(passage).map((blank) => EMPTY_LETTER.repeat(blank.missing.length));
}

const LETTER = /^\p{L}$/u;

/**
 * Fits stored letters to the passage as it is now. A record saved before the
 * answer key changed length must not index past a box that no longer exists,
 * and anything that is not a letter becomes an empty box rather than an error.
 */
export function normalizeLetters(
  passage: CompleteTheWordsPassage,
  letters: readonly string[] | undefined,
): string[] {
  return blanksOf(passage).map((blank, index) => {
    const source = letters?.[index] ?? "";
    let fitted = "";
    for (let position = 0; position < blank.missing.length; position += 1) {
      const character = source[position] ?? EMPTY_LETTER;
      fitted += LETTER.test(character) ? character.toLocaleLowerCase() : EMPTY_LETTER;
    }
    return fitted;
  });
}

/** Marks every missing letter on its own, which is how the task is scored. */
export function gradePassage(
  passage: CompleteTheWordsPassage,
  letters: readonly string[],
): PassageGrade {
  const fitted = normalizeLetters(passage, letters);
  let correctLetters = 0;
  let correctWords = 0;

  const blanks = blanksOf(passage).map((blank, index) => {
    const states = [...blank.missing].map((expected, position): LetterState => {
      const typed = fitted[index][position];
      if (typed === EMPTY_LETTER) {
        return "empty";
      }
      if (typed === expected.toLocaleLowerCase()) {
        correctLetters += 1;
        return "correct";
      }
      return "wrong";
    });
    const correct = states.every((state) => state === "correct");
    if (correct) {
      correctWords += 1;
    }
    return { letters: states, correct };
  });

  return {
    blanks,
    check: {
      correctLetters,
      totalLetters: totalLettersOf(passage),
      correctWords,
      totalWords: blanks.length,
    },
  };
}

export function filledLetterCount(letters: readonly string[]): number {
  let filled = 0;
  for (const word of letters) {
    for (const character of word) {
      if (character !== EMPTY_LETTER) {
        filled += 1;
      }
    }
  }
  return filled;
}

export function passageStatus(record: ReadingPassageRecord | undefined): PassageStatus {
  if (!record) {
    return "new";
  }
  if (record.lastCheck) {
    return "done";
  }
  return filledLetterCount(record.letters) > 0 ? "started" : "new";
}

export function matchesFilter(status: PassageStatus, filter: PassageFilter): boolean {
  if (filter === "all") {
    return true;
  }
  return filter === "done" ? status === "done" : status !== "done";
}

/**
 * The text a learner can actually see. Search runs on this, so typing a word
 * into the search box cannot turn up the passage that hides it.
 */
export function visibleText(passage: CompleteTheWordsPassage): string {
  return passage.parts.map((part) => (typeof part === "string" ? part : part.stem)).join("");
}

export function matchesQuery(passage: CompleteTheWordsPassage, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return true;
  }
  return (
    passage.title.toLocaleLowerCase().includes(needle) ||
    visibleText(passage).toLocaleLowerCase().includes(needle)
  );
}

/** The first passage after `afterId` not yet checked, wrapping to the start. */
export function nextUnfinished(
  passages: readonly CompleteTheWordsPassage[],
  records: Readonly<Record<string, ReadingPassageRecord>>,
  afterId?: string,
): CompleteTheWordsPassage | null {
  const start = afterId ? passages.findIndex((passage) => passage.id === afterId) + 1 : 0;
  for (let offset = 0; offset < passages.length; offset += 1) {
    const candidate = passages[(start + offset) % passages.length];
    if (candidate.id !== afterId && passageStatus(records[candidate.id]) !== "done") {
      return candidate;
    }
  }
  return null;
}

export function sourceLabel(sources: readonly number[]): string {
  const [first, ...rest] = sources.map((test) => `Neo ${String(test).padStart(2, "0")}`);
  return rest.length ? `${first} · also ${rest.join(", ")}` : first;
}

export function percent(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}
