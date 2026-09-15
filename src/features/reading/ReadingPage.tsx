import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DoodleIcon } from "../../components/DoodleIcon";
import { studyRepository } from "../../services/studyRepository";
import type {
  CompleteTheWordsPassage,
  ReadingBlank,
  ReadingPassageRecord,
} from "../../types/reading";
import type { StudyState } from "../../types/study";
import {
  blanksOf,
  completeTheWords,
  EMPTY_LETTER,
  emptyLetters,
  filledLetterCount,
  gradePassage,
  matchesFilter,
  matchesQuery,
  nextUnfinished,
  normalizeLetters,
  type PassageFilter,
  type PassageGrade,
  passageStatus,
  percent,
  sourceLabel,
  totalLettersOf,
} from "./readingModel";
import "../../brutal.css";
import "./reading.css";

const PASSAGES = completeTheWords.passages;
/** Typing writes to storage after a short pause, not on every key. */
const SAVE_DELAY_MS = 400;
const LETTER = /^\p{L}$/u;

const FILTERS: ReadonlyArray<{ value: PassageFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "todo", label: "To do" },
  { value: "done", label: "Done" },
];

interface ReadingPageProps {
  studyState: StudyState;
  requestedPassageId?: string;
  onChanged: () => void;
  onPassageChange?: (passageId: string) => void;
}

interface BlankLayout {
  id: string;
  index: number;
  blank: ReadingBlank;
  /** Position of this blank's first box among all the passage's boxes. */
  start: number;
  boxes: Array<{ id: string; position: number }>;
}

type Segment =
  | { kind: "text"; id: string; text: string }
  | { kind: "blank"; id: string; layout: BlankLayout };

interface Graded {
  letters: string[];
  grade: PassageGrade;
}

function passageById(id: string | undefined): CompleteTheWordsPassage | undefined {
  return id ? PASSAGES.find((passage) => passage.id === id) : undefined;
}

/** Marks survive a return visit only if the letters are the ones that were checked. */
function restoreGrade(
  passage: CompleteTheWordsPassage,
  record: ReadingPassageRecord | undefined,
  letters: string[],
): Graded | null {
  if (!record?.lastCheck || record.updatedAt !== record.lastCheck.checkedAt) {
    return null;
  }
  return { letters, grade: gradePassage(passage, letters) };
}

function layoutPassage(passage: CompleteTheWordsPassage): Segment[] {
  let blankIndex = 0;
  let start = 0;
  return passage.parts.map((part, partIndex): Segment => {
    const id = `${passage.id}-${partIndex}`;
    if (typeof part === "string") {
      return { kind: "text", id, text: part };
    }
    const layout: BlankLayout = {
      id,
      index: blankIndex,
      blank: part,
      start,
      boxes: [...part.missing].map((_, position) => ({ id: `${id}-${position}`, position })),
    };
    blankIndex += 1;
    start += part.missing.length;
    return { kind: "blank", id, layout };
  });
}

export function ReadingPage({
  studyState,
  requestedPassageId,
  onChanged,
  onPassageChange,
}: ReadingPageProps): React.JSX.Element {
  const records = studyState.reading;
  const [activeId, setActiveId] = useState(
    () =>
      passageById(requestedPassageId)?.id ??
      nextUnfinished(PASSAGES, records)?.id ??
      PASSAGES[0].id,
  );
  const passage = passageById(activeId) ?? PASSAGES[0];
  const [letters, setLetters] = useState<string[]>(() =>
    normalizeLetters(passage, records[passage.id]?.letters),
  );
  const [graded, setGraded] = useState<Graded | null>(() =>
    restoreGrade(
      passage,
      records[passage.id],
      normalizeLetters(passage, records[passage.id]?.letters),
    ),
  );
  const [showAnswers, setShowAnswers] = useState(false);
  const [filter, setFilter] = useState<PassageFilter>("all");
  const [query, setQuery] = useState("");

  const titleId = useId();
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ passageId: string; letters: string[] } | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const segments = useMemo(() => layoutPassage(passage), [passage]);
  const blanks = useMemo(() => blanksOf(passage), [passage]);
  const boxCount = totalLettersOf(passage);
  const filled = filledLetterCount(letters);
  const passageIndex = PASSAGES.findIndex((candidate) => candidate.id === passage.id);

  const counts = useMemo(() => {
    let done = 0;
    for (const candidate of PASSAGES) {
      if (passageStatus(records[candidate.id]) === "done") {
        done += 1;
      }
    }
    return { all: PASSAGES.length, todo: PASSAGES.length - done, done };
  }, [records]);

  const visiblePassages = useMemo(
    () =>
      PASSAGES.map((candidate, index) => ({
        passage: candidate,
        index,
        status: passageStatus(records[candidate.id]),
        record: records[candidate.id],
      })).filter((row) => matchesFilter(row.status, filter) && matchesQuery(row.passage, query)),
    [filter, query, records],
  );

  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      studyRepository.saveReadingLetters(pending.passageId, pending.letters);
      onChanged();
    }
  }, [onChanged]);

  const flushRef = useRef(flushSave);
  flushRef.current = flushSave;

  useEffect(
    () => () => {
      flushRef.current();
    },
    [],
  );

  const loadPassage = useCallback(
    (next: CompleteTheWordsPassage) => {
      flushSave();
      const record = studyRepository.getSnapshot().reading[next.id];
      const nextLetters = normalizeLetters(next, record?.letters);
      setActiveId(next.id);
      setLetters(nextLetters);
      setGraded(restoreGrade(next, record, nextLetters));
      setShowAnswers(false);
      onPassageChange?.(next.id);
      window.requestAnimationFrame(() => {
        activeRowRef.current?.scrollIntoView?.({ block: "nearest" });
      });
    },
    [flushSave, onPassageChange],
  );

  // A search result or deep link can ask for a passage while this page is open.
  useEffect(() => {
    const requested = passageById(requestedPassageId);
    if (requested && requested.id !== activeIdRef.current) {
      loadPassage(requested);
    }
  }, [loadPassage, requestedPassageId]);

  const updateLetters = (next: string[]) => {
    setLetters(next);
    pendingRef.current = { passageId: passage.id, letters: next };
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      flushRef.current();
    }, SAVE_DELAY_MS);
  };

  const focusBox = (index: number) => {
    const box = boxRefs.current[Math.max(0, Math.min(index, boxCount - 1))];
    box?.focus();
    box?.select();
  };

  const writeLetter = (source: string[], blank: number, position: number, character: string) => {
    const next = [...source];
    const word = next[blank];
    next[blank] = word.slice(0, position) + character + word.slice(position + 1);
    return next;
  };

  const check = () => {
    if (showAnswers || filled === 0) {
      return;
    }
    // The check stores these letters itself; a queued save landing afterwards
    // would make them look edited and drop the marks on the next visit.
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingRef.current = null;
    const grade = gradePassage(passage, letters);
    studyRepository.recordReadingCheck(passage.id, passage.title, letters, grade.check);
    setGraded({ letters, grade });
    onChanged();
  };

  const onBoxKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    layout: BlankLayout,
    position: number,
  ) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const index = layout.start + position;

    if (event.key === "Enter") {
      event.preventDefault();
      check();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + (event.key === "ArrowLeft" ? -1 : 1));
      return;
    }
    if (showAnswers) {
      return;
    }

    if (event.key.length === 1 && LETTER.test(event.key)) {
      event.preventDefault();
      updateLetters(writeLetter(letters, layout.index, position, event.key.toLocaleLowerCase()));
      focusBox(index + 1);
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      if (letters[layout.index][position] !== EMPTY_LETTER) {
        updateLetters(writeLetter(letters, layout.index, position, EMPTY_LETTER));
        return;
      }
      if (index === 0) {
        return;
      }
      // An empty box hands Backspace to the letter before it, across words.
      const previous = segments
        .flatMap((segment) => (segment.kind === "blank" ? [segment.layout] : []))
        .find(
          (candidate) =>
            index - 1 >= candidate.start && index - 1 < candidate.start + candidate.boxes.length,
        );
      if (previous) {
        updateLetters(
          writeLetter(letters, previous.index, index - 1 - previous.start, EMPTY_LETTER),
        );
      }
      focusBox(index - 1);
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      updateLetters(writeLetter(letters, layout.index, position, EMPTY_LETTER));
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      const nextBlank = blanks[layout.index + 1];
      focusBox(nextBlank ? layout.start + layout.boxes.length : index);
      return;
    }
    // Digits and punctuation never land in a letter box.
    if (event.key.length === 1) {
      event.preventDefault();
    }
  };

  const onBoxPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    layout: BlankLayout,
    position: number,
  ) => {
    event.preventDefault();
    if (showAnswers) {
      return;
    }
    const pasted = [...event.clipboardData.getData("text")]
      .filter((character) => LETTER.test(character))
      .map((character) => character.toLocaleLowerCase());
    if (!pasted.length) {
      return;
    }
    const layouts = segments.flatMap((segment) =>
      segment.kind === "blank" ? [segment.layout] : [],
    );
    let next = letters;
    let cursor = layout.start + position;
    for (const character of pasted) {
      const target = layouts.find(
        (candidate) =>
          cursor >= candidate.start && cursor < candidate.start + candidate.boxes.length,
      );
      if (!target) {
        break;
      }
      next = writeLetter(next, target.index, cursor - target.start, character);
      cursor += 1;
    }
    updateLetters(next);
    focusBox(cursor);
  };

  const clearLetters = () => {
    updateLetters(emptyLetters(passage));
    setGraded(null);
    setShowAnswers(false);
    focusBox(0);
  };

  const toggleAnswers = () => {
    if (!showAnswers) {
      flushSave();
      studyRepository.markReadingRevealed(passage.id, letters);
      onChanged();
    }
    setShowAnswers((current) => !current);
  };

  const nextOpen = nextUnfinished(PASSAGES, records, passage.id);
  const stillGraded = graded?.letters.every((word, index) => word === letters[index]) ?? false;

  const announcement = showAnswers
    ? "Answers shown. Hide them to keep practising."
    : graded && stillGraded
      ? graded.grade.check.correctLetters === boxCount
        ? `All ${boxCount} letters right. Every word is complete.`
        : `${graded.grade.check.correctLetters} of ${boxCount} letters right · ${graded.grade.check.correctWords} of ${blanks.length} words complete.`
      : "";
  const hint =
    filled === 0
      ? "Type into the boxes. Space jumps to the next word, Enter checks."
      : "Check whenever you like, then fix what is marked.";

  const boxState = (layout: BlankLayout, position: number) => {
    const typed = letters[layout.index][position];
    if (showAnswers) {
      return typed === layout.blank.missing[position] ? "correct" : "answer";
    }
    if (!graded || graded.letters[layout.index]?.[position] !== typed) {
      return undefined;
    }
    const state = graded.grade.blanks[layout.index].letters[position];
    return state === "empty" ? undefined : state;
  };

  return (
    <div className="brutal read">
      <header className="brutal__head">
        <div className="brutal__title">
          <span className="brutal__title-mark">
            <DoodleIcon name="bookmark" size={28} />
          </span>
          <div>
            <h1>Reading</h1>
            <p className="b-eyebrow">Complete the words · {PASSAGES.length} passages</p>
          </div>
        </div>

        <div className="brutal__head-actions">
          <span className="b-tag b-tag--mint">
            {counts.done} / {counts.all} done
          </span>
          <button
            type="button"
            className="b-btn b-btn--lime"
            onClick={() => nextOpen && loadPassage(nextOpen)}
            disabled={!nextOpen}
          >
            Next unfinished
            <span aria-hidden>→</span>
          </button>
        </div>
      </header>

      <div className="brutal__body read__body">
        <aside className="b-frame read__pool" aria-label="Passages">
          <div className="read__pool-tools">
            <label className="b-field read__search">
              <DoodleIcon name="search" size={17} />
              <span className="sr-only">Search passages</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search topics"
              />
            </label>
            <fieldset className="b-switch read__filter">
              <legend className="sr-only">Show passages</legend>
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-active={filter === option.value}
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                  <span>{counts[option.value]}</span>
                </button>
              ))}
            </fieldset>
          </div>

          <ol className="b-scroll read__list" aria-label="Passage list">
            {visiblePassages.length ? (
              visiblePassages.map((row) => {
                const active = row.passage.id === passage.id;
                const best = row.record?.bestCorrectLetters ?? 0;
                return (
                  <li key={row.passage.id}>
                    <button
                      ref={active ? activeRowRef : undefined}
                      type="button"
                      className="read__row"
                      data-active={active}
                      data-status={row.status}
                      aria-current={active ? "true" : undefined}
                      onClick={() => loadPassage(row.passage)}
                    >
                      <span className="read__row-num">{row.index + 1}</span>
                      <span className="read__row-copy">
                        <strong>{row.passage.title}</strong>
                        <small>{sourceLabel(row.passage.sources)}</small>
                      </span>
                      <span className="read__row-state">
                        {row.status === "done"
                          ? `${percent(best, row.passage.letterCount)}%`
                          : row.status === "started"
                            ? "Started"
                            : ""}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="read__empty">
                <strong>No passages here.</strong>
                <button
                  type="button"
                  className="b-btn"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Show all passages
                </button>
              </li>
            )}
          </ol>
        </aside>

        <section className="b-frame read__task" aria-labelledby={titleId}>
          <div className="b-head read__task-head">
            <div className="read__task-title">
              <p className="b-eyebrow">
                Passage {passageIndex + 1} of {PASSAGES.length} · {sourceLabel(passage.sources)}
              </p>
              <h2 id={titleId}>{passage.title}</h2>
            </div>
            <span className="b-tag read__filled">
              {filled} / {boxCount} letters
            </span>
          </div>

          <p className="read__instruction">Fill in the missing letters in the paragraph.</p>

          <div className="b-scroll read__passage-scroll">
            <p className="read__passage">
              {segments.map((segment) =>
                segment.kind === "text" ? (
                  <span key={segment.id}>{segment.text}</span>
                ) : (
                  // biome-ignore lint/a11y/useSemanticElements: a fieldset cannot sit inside a paragraph, and each word here is inline text.
                  <span
                    key={segment.id}
                    className="read__word"
                    role="group"
                    aria-label={`Word ${segment.layout.index + 1}: starts with ${segment.layout.blank.stem}, ${segment.layout.boxes.length} letters missing`}
                  >
                    <span className="read__stem">{segment.layout.blank.stem}</span>
                    <span className="read__boxes">
                      {segment.layout.boxes.map((box) => {
                        const state = boxState(segment.layout, box.position);
                        const typed = letters[segment.layout.index][box.position];
                        return (
                          <input
                            key={box.id}
                            ref={(node) => {
                              boxRefs.current[segment.layout.start + box.position] = node;
                            }}
                            type="text"
                            className="read__box"
                            // One stop per word on Tab; arrows move letter by letter.
                            tabIndex={box.position === 0 ? 0 : -1}
                            maxLength={1}
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            readOnly={showAnswers}
                            data-state={state}
                            aria-invalid={state === "wrong" || undefined}
                            aria-label={`Letter ${box.position + 1} of ${segment.layout.boxes.length}`}
                            value={
                              showAnswers
                                ? segment.layout.blank.missing[box.position]
                                : typed === EMPTY_LETTER
                                  ? ""
                                  : typed
                            }
                            onChange={(event) => {
                              const character = [...event.currentTarget.value]
                                .reverse()
                                .find((candidate) => LETTER.test(candidate));
                              if (character && !showAnswers) {
                                updateLetters(
                                  writeLetter(
                                    letters,
                                    segment.layout.index,
                                    box.position,
                                    character.toLocaleLowerCase(),
                                  ),
                                );
                                focusBox(segment.layout.start + box.position + 1);
                              }
                            }}
                            onKeyDown={(event) => onBoxKeyDown(event, segment.layout, box.position)}
                            onPaste={(event) => onBoxPaste(event, segment.layout, box.position)}
                            onFocus={(event) => event.currentTarget.select()}
                          />
                        );
                      })}
                    </span>
                  </span>
                ),
              )}
            </p>
          </div>

          <footer className="read__task-foot">
            <p className="read__result">
              <span role="status">{announcement}</span>
              {announcement ? null : <span>{hint}</span>}
            </p>
            <div className="read__actions">
              <button
                type="button"
                className="b-btn"
                onClick={clearLetters}
                disabled={filled === 0 || showAnswers}
              >
                Clear
              </button>
              <button
                type="button"
                className="b-btn b-btn--sky"
                aria-pressed={showAnswers}
                onClick={toggleAnswers}
              >
                {showAnswers ? "Hide answers" : "Show answers"}
              </button>
              <button
                type="button"
                className="b-btn b-btn--lime"
                onClick={check}
                disabled={filled === 0 || showAnswers}
              >
                Check
              </button>
              <button
                type="button"
                className="b-btn"
                onClick={() => loadPassage(PASSAGES[(passageIndex + 1) % PASSAGES.length])}
              >
                Next passage
                <span aria-hidden>→</span>
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
