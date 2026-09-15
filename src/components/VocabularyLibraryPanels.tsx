import type { ReviewProgressEntry, WordEntry, WordList } from "../types/vocabulary";
import type { WordLocation } from "../services/vocabularyRepository";
import { DoodleIcon } from "./DoodleIcon";

export type StudyStatus = "learning" | "due" | "learned" | "difficult";

const STATUS_LABEL: Record<StudyStatus, string> = {
  learning: "Learning",
  due: "Due",
  learned: "Learned",
  difficult: "Difficult",
};

/* Each status gets one fill and keeps it everywhere: the filter, the row, and
   the inspector all say "difficult" in the same colour. */
const STATUS_TAG: Record<StudyStatus, string> = {
  learning: "b-tag",
  due: "b-tag b-tag--sun",
  learned: "b-tag b-tag--mint",
  difficult: "b-tag b-tag--rose",
};

export function getLibraryDisplayTitle(list: WordList): string {
  if (list.id === "toefl-550-march-2026") {
    return "TOEFL 550 Essential Words";
  }
  if (list.id === "toefl-neo-1-10") {
    return "NEO 1–10 Vocabulary";
  }
  return list.title;
}

export function getStudyStatus(progress: ReviewProgressEntry | undefined): StudyStatus {
  if (!progress || progress.timesSeen === 0) {
    return "learning";
  }
  if (progress.memoryDifficulty >= 7 || progress.lapses >= 2) {
    return "difficult";
  }
  if (progress.timesKnown >= 5) {
    return "learned";
  }
  if (Date.parse(progress.dueAt) <= Date.now()) {
    return "due";
  }
  return "learning";
}

export function isPersianText(value: string | null | undefined): boolean {
  return Boolean(value && /[؀-ۿ]/u.test(value));
}

export function formatDue(iso: string | null | undefined): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) {
    return "Not started";
  }

  const due = new Date(iso);
  if (due.getTime() <= Date.now()) {
    return "Due now";
  }
  if (due.toDateString() === new Date().toDateString()) {
    return "Later today";
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(due);
}

export function StatusTag({ status }: { status: StudyStatus }): React.JSX.Element {
  return <span className={STATUS_TAG[status]}>{STATUS_LABEL[status]}</span>;
}

function HighlightedExample({
  sentence,
  term,
}: {
  sentence: string;
  term: string;
}): React.JSX.Element {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const parts = sentence.split(new RegExp(`(${escaped})`, "giu"));
  let offset = 0;
  const segments = parts.map((text) => {
    const segment = { text, key: `${offset}-${text}` };
    offset += text.length;
    return segment;
  });
  const rtl = isPersianText(sentence);
  return (
    <p className="vlib__example" dir={rtl ? "rtl" : "ltr"}>
      {segments.map((segment) =>
        segment.text.localeCompare(term, undefined, { sensitivity: "base" }) === 0 ? (
          <mark key={segment.key}>{segment.text}</mark>
        ) : (
          segment.text
        ),
      )}
    </p>
  );
}

function WordSections({
  word,
  progress,
}: {
  word: WordEntry;
  progress: ReviewProgressEntry | undefined;
}): React.JSX.Element {
  const meaningIsPersian = isPersianText(word.shortMeaning);
  return (
    <>
      <section className="vlib__section">
        <h3>Meaning</h3>
        <p
          className="vlib__meaning-block"
          data-empty={!word.shortMeaning}
          dir={meaningIsPersian ? "rtl" : "ltr"}
        >
          {word.shortMeaning || "No meaning has been added yet."}
        </p>
      </section>

      {word.exampleSentences[0] ? (
        <section className="vlib__section">
          <h3>Example</h3>
          <HighlightedExample sentence={word.exampleSentences[0]} term={word.term} />
        </section>
      ) : null}

      {word.collocations?.length ? (
        <section className="vlib__section">
          <h3>Collocations</h3>
          <ul className="vlib__chips">
            {word.collocations.map((collocation) => (
              <li key={collocation}>{collocation}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="vlib__section">
        <h3>Review summary</h3>
        <dl className="vlib__tally">
          <div>
            <dt>Seen</dt>
            <dd>{(progress?.timesSeen ?? 0).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Recalled</dt>
            <dd>{(progress?.timesKnown ?? 0).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Recall</dt>
            <dd>
              {progress?.timesSeen
                ? `${Math.round((progress.timesKnown / progress.timesSeen) * 100)}%`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Next</dt>
            <dd>{formatDue(progress?.dueAt)}</dd>
          </div>
        </dl>
      </section>

      {word.tags.length ? (
        <section className="vlib__section">
          <h3>Tags</h3>
          <ul className="vlib__chips vlib__chips--tags">
            {word.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="vlib__section">
        <h3>Notes</h3>
        <p className="vlib__notes">{word.notes || "No note yet. Use Edit to add a memory cue."}</p>
      </section>
    </>
  );
}

export interface WordInspectorProps {
  location: WordLocation | null;
  progress: ReviewProgressEntry | undefined;
  onSpeak: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMarkLearned: () => void;
  onMarkDifficult: () => void;
  /** Inside a dialog the title bar is already the dialog's, so the head is dropped. */
  embedded?: boolean;
}

export function WordInspector({
  location,
  progress,
  onSpeak,
  onEdit,
  onDelete,
  onMarkLearned,
  onMarkDifficult,
  embedded = false,
}: WordInspectorProps): React.JSX.Element {
  if (!location) {
    return (
      <aside className="b-frame vlib__inspector" aria-labelledby="vlib-inspector-empty">
        <div className="vlib__inspector-empty">
          <DoodleIcon name="doc" size={34} />
          <h2 id="vlib-inspector-empty">No word selected</h2>
          <p>Choose a row to see its meaning, example, and review history.</p>
        </div>
      </aside>
    );
  }

  const { word, list } = location;
  const status = getStudyStatus(progress);
  const editable = !list.isBuiltIn;
  const meta = [word.partOfSpeech, word.pronunciation].filter(Boolean).join(" · ");
  const actions = (
    <>
      <button type="button" className="b-btn b-btn--mint" onClick={onMarkLearned}>
        <DoodleIcon name="checklist" size={14} />
        Mark learned
      </button>
      <button type="button" className="b-btn b-btn--rose" onClick={onMarkDifficult}>
        <DoodleIcon name="bookmark" size={14} />
        Mark difficult
      </button>
      <button
        type="button"
        className="b-btn"
        onClick={onEdit}
        disabled={!editable}
        title={editable ? undefined : "Built-in words cannot be edited"}
      >
        <DoodleIcon name="pencil" size={16} />
        Edit
      </button>
      <button
        type="button"
        className="b-btn b-btn--flame"
        onClick={onDelete}
        disabled={!editable}
        title={editable ? undefined : "Built-in words cannot be deleted"}
      >
        <DoodleIcon name="delete" size={16} />
        Delete
      </button>
    </>
  );

  if (embedded) {
    return (
      <div className="vlib__inspector-embedded">
        <div className="vlib__inspector-tags">
          <StatusTag status={status} />
          <span className="b-tag vlib__collection-tag" data-color={list.color}>
            <i aria-hidden />
            {getLibraryDisplayTitle(list)}
          </span>
        </div>
        <WordSections word={word} progress={progress} />
        <div className="vlib__inspector-foot">{actions}</div>
      </div>
    );
  }

  return (
    <aside className="b-frame vlib__inspector" aria-labelledby="vlib-inspector-heading">
      <header className="vlib__inspector-head">
        <div className="vlib__inspector-tags">
          <StatusTag status={status} />
          <span className="b-tag vlib__collection-tag" data-color={list.color}>
            <i aria-hidden />
            {getLibraryDisplayTitle(list)}
          </span>
        </div>
        <div className="vlib__inspector-title">
          <div>
            <h2 id="vlib-inspector-heading">{word.term}</h2>
            {meta ? <p>{meta}</p> : null}
          </div>
          <button
            type="button"
            className="b-icon-btn"
            onClick={onSpeak}
            aria-label={`Pronounce ${word.term}`}
          >
            <DoodleIcon name="speaker" size={20} />
          </button>
        </div>
      </header>

      <div className="b-scroll vlib__inspector-body">
        <WordSections word={word} progress={progress} />
      </div>

      <footer className="vlib__inspector-foot">{actions}</footer>
    </aside>
  );
}
