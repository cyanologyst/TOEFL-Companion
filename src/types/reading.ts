/** A Complete the Words passage is prose with some words cut short. */
export type ReadingPart = string | ReadingBlank;

export interface ReadingBlank {
  /** The start of the word, which the learner can see. */
  stem: string;
  /** The rest of the word: one box per letter, and the answer key. */
  missing: string;
}

export interface CompleteTheWordsPassage {
  id: string;
  title: string;
  /** Every NEO test the passage appears in. Duplicates are merged at build
   *  time, so one passage can list more than one test. */
  sources: number[];
  blankCount: number;
  letterCount: number;
  parts: ReadingPart[];
}

export interface CompleteTheWordsLibrary {
  schemaVersion: 1;
  task: "Complete the Words";
  source: string;
  passages: CompleteTheWordsPassage[];
}

export interface ReadingCheck {
  checkedAt: string;
  correctLetters: number;
  totalLetters: number;
  correctWords: number;
  totalWords: number;
}

export interface ReadingPassageRecord {
  passageId: string;
  /** One string per blank, as long as its hidden part. A space is an empty box. */
  letters: string[];
  updatedAt: string;
  lastCheck: ReadingCheck | null;
  bestCorrectLetters: number;
  checks: number;
  revealedAt: string | null;
}
