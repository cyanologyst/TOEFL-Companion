import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { SpeakerHighIcon } from "@phosphor-icons/react/SpeakerHigh";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { XIcon } from "@phosphor-icons/react/X";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReviewProgressEntry, WordEntry, WordList } from "../types/vocabulary";
import { formatCount } from "../lib/format";
import { DoodleIcon } from "./DoodleIcon";

export type StudyStatus = "new" | "learning" | "reviewing" | "mastered";

export function getLibraryDisplayTitle(list: WordList): string {
  if (list.id === "toefl-550-march-2026") {
    return "TOEFL 550 Essential Words";
  }
  if (list.id === "toefl-neo-1-10") {
    return "NEO 1–10 Vocabulary";
  }
  return list.title;
}

export function getStudyStatus(progress: ReviewProgressEntry | undefined): {
  key: StudyStatus;
  label: string;
} {
  if (!progress || progress.timesSeen === 0) {
    return { key: "new", label: "New" };
  }
  if (progress.timesKnown < 2) {
    return { key: "learning", label: "Learning" };
  }
  if (progress.timesKnown < 5) {
    return { key: "reviewing", label: "Reviewing" };
  }
  return { key: "mastered", label: "Mastered" };
}

export function isPersianText(value: string | null | undefined): boolean {
  return Boolean(value && /[\u0600-\u06ff]/u.test(value));
}

function IconAction({
  label,
  disabled = false,
  children,
  onClick,
  tone,
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "danger";
}): React.JSX.Element {
  return (
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="tc-library__detail-action"
            data-tone={tone}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="app-tooltip" sideOffset={7}>
            {label}
            <Tooltip.Arrow className="app-tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function ReviewStatusBadge({
  progress,
}: {
  progress: ReviewProgressEntry | undefined;
}): React.JSX.Element {
  const status = getStudyStatus(progress);
  return (
    <span className="tc-library__status-badge" data-status={status.key}>
      {status.label}
    </span>
  );
}

export function WordlistPanel({
  lists,
  selectedListId,
  onSelect,
  onToggleReview,
  onCreateList,
  onClose,
}: {
  lists: WordList[];
  selectedListId: string;
  onSelect: (list: WordList) => void;
  onToggleReview: (list: WordList, enabled: boolean) => void;
  onCreateList: () => void;
  onClose?: () => void;
}): React.JSX.Element {
  return (
    <nav className="tc-library__navigator" aria-labelledby="tc-library-lists-heading">
      <div className="tc-library__navigator-heading">
        <div>
          <h3 id="tc-library-lists-heading">Libraries</h3>
          <span>{lists.length}</span>
        </div>
        {onClose ? (
          <IconAction label="Close wordlists" onClick={onClose}>
            <XIcon size={18} aria-hidden />
          </IconAction>
        ) : null}
      </div>
      <button type="button" className="tc-library__new-list" onClick={onCreateList}>
        <PlusIcon size={16} weight="bold" aria-hidden />
        New library
      </button>
      <ul className="tc-library__list-selector">
        {lists.map((list) => {
          const active = list.id === selectedListId;
          const displayTitle = getLibraryDisplayTitle(list);
          return (
            <li className="tc-library__list-item" data-active={active} key={list.id}>
              <button
                type="button"
                className="tc-library__list-button"
                onClick={() => onSelect(list)}
                aria-current={active ? "page" : undefined}
                title={list.title}
              >
                <span>{displayTitle}</span>
                <small>{formatCount(list.words.length, "word")}</small>
              </button>
              <button
                type="button"
                role="switch"
                className="tc-library__review-switch"
                aria-checked={list.isEnabled}
                aria-label={`Review enabled for ${list.title}`}
                title={`${list.isEnabled ? "Disable" : "Enable"} review for ${list.title}`}
                onClick={() => onToggleReview(list, !list.isEnabled)}
              >
                <span className="tc-library__switch-track" aria-hidden>
                  <span />
                </span>
                <small>{list.isEnabled ? "On" : "Off"}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
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
  let characterOffset = 0;
  const segments = parts.map((text) => {
    const segment = { text, key: `${characterOffset}-${text}` };
    characterOffset += text.length;
    return segment;
  });
  return (
    <p dir={isPersianText(sentence) ? "rtl" : "ltr"} data-rtl={isPersianText(sentence)}>
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

export function WordDetailsPanel({
  word,
  progress,
  canEdit,
  scheduleLabel,
  onSpeak,
  onEdit,
  onDelete,
  onMarkLearned,
  onMarkDifficult,
  onClose,
}: {
  word: WordEntry | undefined;
  progress: ReviewProgressEntry | undefined;
  canEdit: boolean;
  scheduleLabel: string;
  onSpeak: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMarkLearned: () => void;
  onMarkDifficult: () => void;
  onClose?: () => void;
}): React.JSX.Element {
  if (!word) {
    return (
      <aside className="tc-library__inspector" aria-labelledby="tc-library-inspector-heading">
        <div className="tc-library__inspector-empty">
          <h3 id="tc-library-inspector-heading">No word selected</h3>
          <p>Select a term to see its meaning and review history.</p>
        </div>
      </aside>
    );
  }

  const hasPronunciation = Boolean(word.pronunciation?.trim());
  const status = getStudyStatus(progress);
  const meaningIsPersian = isPersianText(word.shortMeaning);

  return (
    <aside className="tc-library__inspector" aria-labelledby="tc-library-inspector-heading">
      <header className="tc-library__inspector-header">
        <div className="tc-library__inspector-eyebrow">
          <ReviewStatusBadge progress={progress} />
          {onClose ? (
            <IconAction label="Close word details" onClick={onClose}>
              <XIcon size={18} aria-hidden />
            </IconAction>
          ) : null}
        </div>
        <div className="tc-library__inspector-title-row">
          <div>
            <h3 id="tc-library-inspector-heading">{word.term}</h3>
            {[word.partOfSpeech, word.pronunciation].filter(Boolean).length ? (
              <p>{[word.partOfSpeech, word.pronunciation].filter(Boolean).join(" · ")}</p>
            ) : null}
          </div>
          <div className="tc-library__detail-actions">
            <IconAction
              label={
                hasPronunciation
                  ? `Play pronunciation for ${word.term}`
                  : "Pronunciation unavailable"
              }
              disabled={!hasPronunciation}
              onClick={onSpeak}
            >
              <SpeakerHighIcon size={18} aria-hidden />
            </IconAction>
            <IconAction
              label={canEdit ? `Edit ${word.term}` : "Built-in words cannot be edited"}
              disabled={!canEdit}
              onClick={onEdit}
            >
              <PencilSimpleIcon size={18} aria-hidden />
            </IconAction>
            {canEdit ? (
              <IconAction label={`Delete ${word.term}`} tone="danger" onClick={onDelete}>
                <TrashIcon size={18} aria-hidden />
              </IconAction>
            ) : null}
          </div>
        </div>
      </header>

      <section className="tc-library__definition" aria-labelledby="tc-library-definition-heading">
        <h4 id="tc-library-definition-heading">Meaning</h4>
        <p dir={meaningIsPersian ? "rtl" : "ltr"} data-rtl={meaningIsPersian}>
          {word.shortMeaning || "No meaning added."}
        </p>
      </section>

      {word.exampleSentences[0] ? (
        <section className="tc-library__detail-section">
          <h4>Example</h4>
          <HighlightedExample sentence={word.exampleSentences[0]} term={word.term} />
        </section>
      ) : null}

      {word.collocations?.length ? (
        <section className="tc-library__detail-section">
          <h4>Collocations</h4>
          <div className="tc-library__collocations">
            {word.collocations.map((collocation) => (
              <span key={collocation}>{collocation}</span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="tc-library__detail-section">
        <div className="tc-library__detail-section-heading">
          <h4>Review summary</h4>
        </div>
        <dl className="tc-library__review-details">
          <div>
            <dt>Seen</dt>
            <dd>{(progress?.timesSeen ?? 0).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Correct</dt>
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
            <dd>{scheduleLabel}</dd>
          </div>
        </dl>
        {status.key !== "new" && word.chapter !== null ? (
          <p className="tc-library__chapter">Chapter {word.chapter}</p>
        ) : null}
      </section>

      {word.tags.length ? (
        <section className="tc-library__detail-section">
          <h4>Tags</h4>
          <div className="tc-library__tags">
            {word.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </section>
      ) : null}

      {word.notes ? (
        <section className="tc-library__detail-section">
          <h4>Notes</h4>
          <p>{word.notes}</p>
        </section>
      ) : null}

      <footer className="tc-library__inspector-footer">
        <button type="button" className="tc-library__mastery-action" onClick={onMarkLearned}>
          <DoodleIcon name="checklist" size={17} />
          Mark learned
        </button>
        <button type="button" className="tc-library__mastery-action" onClick={onMarkDifficult}>
          <DoodleIcon name="bookmark" size={17} />
          Mark difficult
        </button>
      </footer>
    </aside>
  );
}
