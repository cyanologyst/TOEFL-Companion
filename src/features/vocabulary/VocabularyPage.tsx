import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DoodleIcon } from "../../components/DoodleIcon";
import { Modal } from "../../components/Modal";
import { ConfirmDialog, EmptyState, Tooltip } from "../../components/StudyUI";
import { applyReviewAction, calculateVocabularyStats } from "./vocabularyEngine";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useVocabularySnapshot } from "../../hooks/useVocabularySnapshot";
import {
  createEmptyProgress,
  createReviewEvent,
  vocabularyRepository,
  type PersonalWordDraft,
  type WordLocation,
} from "../../services/vocabularyRepository";
import { studyRepository } from "../../services/studyRepository";
import { speakVocabulary } from "../../services/vocabularyBrowser";
import type { ReviewAction } from "../../types/vocabulary";

type VocabularyView = "library" | "review";
const WORDS_PER_PAGE = 20;
type LibraryFilter = "all" | "due" | "learned" | "difficult";

interface VocabularyPageProps {
  initialView?: VocabularyView;
  initialWordId?: string;
  onNotice: (message: string) => void;
  onOpenLibrary?: () => void;
}

const EMPTY_DRAFT: PersonalWordDraft = {
  term: "",
  shortMeaning: "",
  partOfSpeech: "",
  pronunciation: "",
  exampleSentence: "",
  collocations: [],
  notes: "",
};

function wordStatus(
  location: WordLocation,
  progress: ReturnType<typeof vocabularyRepository.getSnapshot>["progress"],
): LibraryFilter | "learning" {
  const entry = progress[location.word.id];
  if (!entry || entry.timesSeen === 0) {
    return "learning";
  }
  if (entry.memoryDifficulty >= 7 || entry.lapses >= 2) {
    return "difficult";
  }
  if (entry.timesKnown >= 5) {
    return "learned";
  }
  if (Date.parse(entry.dueAt) <= Date.now()) {
    return "due";
  }
  return "learning";
}

function formatDue(iso: string | undefined): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) {
    return "Not started";
  }
  const due = new Date(iso);
  const today = new Date();
  if (due.getTime() <= Date.now()) {
    return "Due now";
  }
  if (due.toDateString() === today.toDateString()) {
    return "Later today";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(due);
}

function downloadText(contents: string, name: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function VocabularyPage({
  initialView = "library",
  initialWordId,
  onNotice,
  onOpenLibrary,
}: VocabularyPageProps): React.JSX.Element {
  const snapshot = useVocabularySnapshot();
  const [view, setView] = useState<VocabularyView>(initialView);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [selectedWordId, setSelectedWordId] = useState<string | null>(initialWordId ?? null);
  const [detailOpen, setDetailOpen] = useState(Boolean(initialWordId));
  const [deleteTarget, setDeleteTarget] = useState<WordLocation | null>(null);
  const [wordModalOpen, setWordModalOpen] = useState(false);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [editing, setEditing] = useState<WordLocation | null>(null);
  const [draft, setDraft] = useState<PersonalWordDraft>(EMPTY_DRAFT);
  const [targetListId, setTargetListId] = useState(vocabularyRepository.personalListId);
  const [collectionTitle, setCollectionTitle] = useState("");
  const [page, setPage] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);
  const isNarrowLibrary = useMediaQuery("(max-width: 1180px)");

  const stats = useMemo(
    () =>
      calculateVocabularyStats(
        snapshot.wordLists,
        snapshot.progress,
        snapshot.events,
        new Date().toISOString(),
        snapshot.settings.dailyReviewGoal,
      ),
    [snapshot],
  );
  const locations = useMemo(() => vocabularyRepository.getAllWords(snapshot), [snapshot]);
  const filtered = useMemo(
    () =>
      locations.filter((location) => {
        const searchable = [
          location.word.term,
          location.word.shortMeaning,
          location.word.partOfSpeech,
          location.word.notes,
          ...location.word.tags,
          ...(location.word.collocations ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        const matchesQuery = !deferredQuery || searchable.includes(deferredQuery);
        const status = wordStatus(location, snapshot.progress);
        const matchesFilter = filter === "all" || status === filter;
        const matchesCollection =
          collectionFilter === "all" || location.list.id === collectionFilter;
        return matchesQuery && matchesFilter && matchesCollection;
      }),
    [collectionFilter, deferredQuery, filter, locations, snapshot.progress],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / WORDS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleWords = filtered.slice(safePage * WORDS_PER_PAGE, (safePage + 1) * WORDS_PER_PAGE);

  const selected =
    filtered.find((location) => location.word.id === selectedWordId) ?? visibleWords[0] ?? null;

  useEffect(() => {
    if (!initialWordId) {
      return;
    }
    const targetIndex = filtered.findIndex((location) => location.word.id === initialWordId);
    if (targetIndex >= 0) {
      setSelectedWordId(initialWordId);
      setPage(Math.floor(targetIndex / WORDS_PER_PAGE));
    }
  }, [filtered, initialWordId]);

  const selectWord = (location: WordLocation) => {
    setSelectedWordId(location.word.id);
    if (isNarrowLibrary) {
      setDetailOpen(true);
    }
  };

  const deleteWord = (location: WordLocation) => {
    try {
      vocabularyRepository.deleteEditableWord(location.list.id, location.word.id);
      setSelectedWordId(null);
      setDetailOpen(false);
      setDeleteTarget(null);
      onNotice("Word removed from the collection.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The word could not be removed.");
    }
  };

  const openAdd = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setTargetListId(vocabularyRepository.personalListId);
    setWordModalOpen(true);
  };

  const openEdit = (location: WordLocation) => {
    setEditing(location);
    setTargetListId(location.list.id);
    setDraft({
      term: location.word.term,
      shortMeaning: location.word.shortMeaning ?? "",
      partOfSpeech: location.word.partOfSpeech ?? "",
      pronunciation: location.word.pronunciation ?? "",
      exampleSentence: location.word.exampleSentences[0] ?? "",
      collocations: location.word.collocations ?? [],
      notes: location.word.notes ?? "",
    });
    setWordModalOpen(true);
  };

  const saveWord = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editing) {
        vocabularyRepository.updateEditableWord(editing.list.id, editing.word.id, draft);
        onNotice("Word updated.");
      } else {
        const word = await vocabularyRepository.addWordToList(draft, targetListId);
        setSelectedWordId(word.id);
        onNotice("Word added to your library.");
      }
      setWordModalOpen(false);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The word could not be saved.");
    }
  };

  const createCollection = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const list = vocabularyRepository.createWordList(collectionTitle);
      setTargetListId(list.id);
      setCollectionTitle("");
      setCollectionModalOpen(false);
      onNotice(`Created “${list.title}”.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The collection could not be created.");
    }
  };

  const importLibrary = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const value = JSON.parse(await file.text()) as unknown;
      const result = vocabularyRepository.importWordList(value, true);
      onNotice(
        `Imported ${result.list.words.length} words${
          result.skippedDuplicates ? ` and skipped ${result.skippedDuplicates} duplicates` : ""
        }.`,
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The JSON library could not be imported.");
    }
  };

  const markLearned = (location: WordLocation) => {
    const current = snapshot.progress[location.word.id] ?? createEmptyProgress(location.word.id);
    const progress = {
      ...current,
      timesSeen: Math.max(5, current.timesSeen),
      timesKnown: Math.max(5, current.timesKnown),
      consecutiveCorrect: Math.max(5, current.consecutiveCorrect),
      memoryDifficulty: Math.min(3, current.memoryDifficulty),
      lastReviewedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
    vocabularyRepository.setProgress(
      location.word.id,
      progress,
      createReviewEvent(location, "known", 0),
    );
    studyRepository.addActivity(
      "vocabulary",
      `Learned ${location.word.term}`,
      "Marked as mastered",
    );
    onNotice("Marked as learned.");
  };

  const markDifficult = (location: WordLocation) => {
    const current = snapshot.progress[location.word.id] ?? createEmptyProgress(location.word.id);
    const progress = {
      ...current,
      timesSeen: Math.max(1, current.timesSeen),
      timesSkipped: current.timesSkipped + 1,
      lapses: Math.max(2, current.lapses + 1),
      memoryDifficulty: Math.max(8, current.memoryDifficulty),
      lastReviewedAt: new Date().toISOString(),
      dueAt: new Date().toISOString(),
    };
    vocabularyRepository.setProgress(
      location.word.id,
      progress,
      createReviewEvent(location, "skipped", 0),
    );
    onNotice("Added to difficult words.");
  };

  const detailsContent = selected ? (
    <WordDetails
      location={selected}
      progress={snapshot.progress[selected.word.id]}
      settings={snapshot.settings}
      onEdit={() => openEdit(selected)}
      onDelete={() => setDeleteTarget(selected)}
      onMarkLearned={() => markLearned(selected)}
      onMarkDifficult={() => markDifficult(selected)}
    />
  ) : (
    <EmptyState
      compact
      icon="doc"
      title="Select a word"
      description="Its meaning, examples, notes, and review state will appear here."
    />
  );

  return (
    <div className="brutal vocabulary-page">
      <header className="brutal__head">
        <div className="brutal__title">
          <span className="brutal__title-mark">
            <DoodleIcon name="doc" size={28} />
          </span>
          <div>
            <h1>Vocabulary</h1>
            <p className="b-eyebrow">Build and master your TOEFL wordlist</p>
          </div>
        </div>

        <div className="brutal__head-actions">
          {/* The view switch is the primary control here, so it sits with the
              actions rather than as a band under the title. */}
          <div className="b-switch" role="tablist" aria-label="Vocabulary view">
            <button
              type="button"
              role="tab"
              aria-selected={view === "library"}
              data-active={view === "library"}
              onClick={() => {
                if (onOpenLibrary) {
                  onOpenLibrary();
                  return;
                }
                setView("library");
              }}
            >
              Library {stats.totalWords}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "review"}
              data-active={view === "review"}
              onClick={() => setView("review")}
            >
              Review {stats.dueNow + stats.new}
            </button>
          </div>

          <input
            ref={importRef}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importLibrary(event)}
          />
          <button type="button" className="b-btn" onClick={() => importRef.current?.click()}>
            <DoodleIcon name="upload" size={17} />
            Import
          </button>
          <button type="button" className="b-btn b-btn--lime" onClick={openAdd}>
            <span aria-hidden>＋</span>
            Add word
          </button>
        </div>
      </header>

      {view === "review" ? (
        <ReviewWorkspace snapshot={snapshot} onNotice={onNotice} />
      ) : (
        <div className="vocabulary-library-layout">
          <section className="panel vocabulary-table-panel">
            <div className="library-toolbar">
              <label className="search-field">
                <DoodleIcon name="search" size={17} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                    setSelectedWordId(null);
                  }}
                  placeholder="Search words, meanings, or tags…"
                  aria-label="Search vocabulary"
                />
              </label>
              <label className="library-collection-filter">
                <span className="sr-only">Filter by collection</span>
                <select
                  value={collectionFilter}
                  onChange={(event) => {
                    setCollectionFilter(event.target.value);
                    setPage(0);
                    setSelectedWordId(null);
                  }}
                >
                  <option value="all">All collections</option>
                  {snapshot.wordLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.title}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="library-filter-tabs">
                <legend className="sr-only">Filter vocabulary</legend>
                {(
                  [
                    ["all", "All", stats.totalWords],
                    ["due", "Due", stats.dueNow],
                    ["learned", "Learned", stats.mastered],
                    ["difficult", "Difficult", stats.difficultWords],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    data-active={filter === value}
                    aria-pressed={filter === value}
                    onClick={() => {
                      setFilter(value);
                      setPage(0);
                      setSelectedWordId(null);
                    }}
                  >
                    {label} <span>{count}</span>
                  </button>
                ))}
              </fieldset>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setCollectionModalOpen(true)}
              >
                <DoodleIcon name="folder-add" size={17} />
                New collection
              </button>
            </div>

            {filtered.length ? (
              <div className="word-table-wrap">
                <table className="word-table" aria-label="Vocabulary words">
                  <thead>
                    <tr>
                      <th>Word</th>
                      <th>Meaning</th>
                      <th>Status</th>
                      <th>Next review</th>
                      <th>Collection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWords.map((location) => {
                      const status = wordStatus(location, snapshot.progress);
                      return (
                        <tr
                          key={location.word.id}
                          data-word-row
                          data-selected={selected?.word.id === location.word.id}
                          aria-selected={selected?.word.id === location.word.id}
                          tabIndex={selected?.word.id === location.word.id ? 0 : -1}
                          onClick={() => selectWord(location)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) {
                              return;
                            }
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectWord(location);
                              return;
                            }
                            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                              return;
                            }
                            event.preventDefault();
                            const rows = Array.from(
                              event.currentTarget
                                .closest("tbody")
                                ?.querySelectorAll<HTMLTableRowElement>("tr[data-word-row]") ?? [],
                            );
                            const currentIndex = rows.indexOf(event.currentTarget);
                            const nextIndex =
                              event.key === "ArrowDown"
                                ? Math.min(rows.length - 1, currentIndex + 1)
                                : Math.max(0, currentIndex - 1);
                            const nextLocation = visibleWords[nextIndex];
                            if (nextLocation) {
                              setSelectedWordId(nextLocation.word.id);
                              rows[nextIndex]?.focus();
                            }
                          }}
                        >
                          <td>
                            <strong>{location.word.term}</strong>
                            <Tooltip content={`Pronounce ${location.word.term}`}>
                              <button
                                type="button"
                                className="word-audio-button"
                                aria-label={`Pronounce ${location.word.term}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  speakVocabulary(location.word.term, snapshot.settings);
                                }}
                              >
                                <DoodleIcon name="speaker" size={16} />
                              </button>
                            </Tooltip>
                          </td>
                          <td>{location.word.shortMeaning || "Add a meaning"}</td>
                          <td>
                            <span className={`status-chip status-chip--${status}`}>
                              {status === "learning"
                                ? "Learning"
                                : status.charAt(0).toLocaleUpperCase() + status.slice(1)}
                            </span>
                          </td>
                          <td>{formatDue(snapshot.progress[location.word.id]?.dueAt)}</td>
                          <td>{location.list.title}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <footer className="table-footer">
                  <span>
                    Showing {safePage * WORDS_PER_PAGE + 1}–
                    {Math.min((safePage + 1) * WORDS_PER_PAGE, filtered.length)} of{" "}
                    {filtered.length} words
                  </span>
                  <div>
                    <button
                      type="button"
                      className="button button--quiet button--compact"
                      disabled={safePage === 0}
                      onClick={() => setPage((current) => Math.max(0, current - 1))}
                    >
                      ‹ Previous
                    </button>
                    <span>
                      {safePage + 1} / {pageCount}
                    </span>
                    <button
                      type="button"
                      className="button button--quiet button--compact"
                      disabled={safePage >= pageCount - 1}
                      onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                    >
                      Next ›
                    </button>
                  </div>
                </footer>
              </div>
            ) : (
              <div className="empty-state">
                <DoodleIcon name="search" size={42} />
                <h3>No words match this view.</h3>
                <p>Try another filter or add a word to your own collection.</p>
                <button type="button" className="button button--primary" onClick={openAdd}>
                  Add a word
                </button>
              </div>
            )}
          </section>

          {!isNarrowLibrary ? (
            <aside className="panel word-detail-panel" aria-label="Selected word details">
              {detailsContent}
            </aside>
          ) : null}
        </div>
      )}

      <Modal
        open={isNarrowLibrary && detailOpen && selected !== null}
        title={selected?.word.term ?? "Word details"}
        description="Meaning, examples, notes, and review status."
        onClose={() => setDetailOpen(false)}
      >
        <div className="word-detail-drawer">{detailsContent}</div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this word?"
        description="This removes the word and its review progress from this collection."
        confirmLabel="Delete word"
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteWord(deleteTarget);
          }
        }}
      />

      <Modal
        open={wordModalOpen}
        title={editing ? "Edit word" : "Add a word"}
        description="Keep each entry concise enough to review quickly."
        onClose={() => setWordModalOpen(false)}
      >
        <form className="modal-form" onSubmit={(event) => void saveWord(event)}>
          {!editing ? (
            <label>
              Collection
              <select
                value={targetListId}
                onChange={(event) => setTargetListId(event.target.value)}
              >
                {snapshot.wordLists
                  .filter((list) => !list.isBuiltIn)
                  .map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.title}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <div className="form-grid form-grid--two">
            <label>
              Word or collocation
              <input
                required
                value={draft.term}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, term: event.target.value }))
                }
              />
            </label>
            <label>
              Part of speech
              <input
                value={draft.partOfSpeech}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    partOfSpeech: event.target.value,
                  }))
                }
                placeholder="noun, verb, phrase…"
              />
            </label>
          </div>
          <label>
            Meaning
            <textarea
              required
              rows={2}
              value={draft.shortMeaning}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  shortMeaning: event.target.value,
                }))
              }
            />
          </label>
          <div className="form-grid form-grid--two">
            <label>
              Pronunciation
              <input
                value={draft.pronunciation}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    pronunciation: event.target.value,
                  }))
                }
                placeholder="/…/"
              />
            </label>
            <label>
              Collocations
              <input
                value={(draft.collocations ?? []).join(", ")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    collocations: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="abundant resources, abundant evidence"
              />
            </label>
          </div>
          <label>
            Example sentence
            <textarea
              rows={2}
              value={draft.exampleSentence}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  exampleSentence: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Notes
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </label>
          <footer className="modal-actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setWordModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="button button--primary">
              {editing ? "Save changes" : "Add to library"}
            </button>
          </footer>
        </form>
      </Modal>

      <Modal
        open={collectionModalOpen}
        title="New collection"
        description="Collections keep personal vocabulary organized without changing the built-in libraries."
        onClose={() => setCollectionModalOpen(false)}
      >
        <form className="modal-form" onSubmit={createCollection}>
          <label>
            Collection name
            <input
              required
              value={collectionTitle}
              onChange={(event) => setCollectionTitle(event.target.value)}
              placeholder="Reading notes, Environment, Collocations…"
            />
          </label>
          <footer className="modal-actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setCollectionModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="button button--primary">
              Create collection
            </button>
          </footer>
        </form>
      </Modal>
    </div>
  );
}

function WordDetails({
  location,
  progress,
  settings,
  onEdit,
  onDelete,
  onMarkLearned,
  onMarkDifficult,
}: {
  location: WordLocation;
  progress: ReturnType<typeof createEmptyProgress> | undefined;
  settings: ReturnType<typeof vocabularyRepository.getSnapshot>["settings"];
  onEdit: () => void;
  onDelete: () => void;
  onMarkLearned: () => void;
  onMarkDifficult: () => void;
}): React.JSX.Element {
  const editable = !location.list.isBuiltIn;
  const { word } = location;
  return (
    <div className="word-details">
      <header>
        <div>
          <h2>{word.term}</h2>
          <p>
            {[word.partOfSpeech, word.pronunciation].filter(Boolean).join(" · ") ||
              location.list.title}
          </p>
        </div>
        <Tooltip content={`Pronounce ${word.term}`}>
          <button
            type="button"
            className="icon-button"
            onClick={() => speakVocabulary(word.term, settings)}
            aria-label={`Pronounce ${word.term}`}
          >
            <DoodleIcon name="speaker" size={19} />
          </button>
        </Tooltip>
      </header>
      <section>
        <h3>Meaning</h3>
        <p>{word.shortMeaning || "No meaning has been added yet."}</p>
      </section>
      <section>
        <h3>Example</h3>
        {word.exampleSentences[0] ? (
          <p>{word.exampleSentences[0]}</p>
        ) : editable ? (
          <button type="button" className="empty-inline-action" onClick={onEdit}>
            <DoodleIcon name="pen" size={17} />
            Add an example in your own context
          </button>
        ) : (
          <p className="muted">No example is included in this source list.</p>
        )}
      </section>
      <section>
        <h3>Collocations</h3>
        {word.collocations?.length ? (
          <ul>
            {word.collocations.map((collocation) => (
              <li key={collocation}>{collocation}</li>
            ))}
          </ul>
        ) : editable ? (
          <button type="button" className="empty-inline-action" onClick={onEdit}>
            <DoodleIcon name="folder-add" size={17} />
            Add useful collocations
          </button>
        ) : (
          <p className="muted">No collocations are included in this source list.</p>
        )}
      </section>
      <section className="word-notes">
        <h3>Your notes</h3>
        <p>{word.notes || "Use Edit to add a memory cue or usage note."}</p>
      </section>
      <div className="word-meta">
        <span>
          <strong>{progress?.timesSeen ?? 0}</strong> reviews
        </span>
        <span>
          <strong>{progress?.timesKnown ?? 0}</strong> recalled
        </span>
        <span>
          <strong>{formatDue(progress?.dueAt)}</strong> next
        </span>
      </div>
      <div className="word-detail-actions">
        {editable ? (
          <button type="button" className="button button--outline" onClick={onEdit}>
            <DoodleIcon name="pencil" size={16} />
            Edit
          </button>
        ) : null}
        <button type="button" className="button button--outline" onClick={onMarkLearned}>
          Mark learned
        </button>
        <button type="button" className="button button--quiet" onClick={onMarkDifficult}>
          Mark difficult
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() =>
            downloadText(
              vocabularyRepository.exportWordList(location.list.id),
              `${location.list.id}.json`,
            )
          }
        >
          <DoodleIcon name="download" size={16} />
          Export collection
        </button>
        {editable ? (
          <button type="button" className="button button--danger" onClick={onDelete}>
            <DoodleIcon name="delete" size={16} />
            Delete word
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReviewWorkspace({
  snapshot,
  onNotice,
}: {
  snapshot: ReturnType<typeof vocabularyRepository.getSnapshot>;
  onNotice: (message: string) => void;
}): React.JSX.Element {
  const [sessionWordIds] = useState(() => {
    const now = Date.now();
    return [...vocabularyRepository.getEnabledWords(snapshot)]
      .sort((left, right) => {
        const leftDue = Date.parse(snapshot.progress[left.word.id]?.dueAt ?? "0001-01-01");
        const rightDue = Date.parse(snapshot.progress[right.word.id]?.dueAt ?? "0001-01-01");
        const leftPriority = leftDue <= now ? leftDue : leftDue + 10_000_000_000;
        const rightPriority = rightDue <= now ? rightDue : rightDue + 10_000_000_000;
        return leftPriority - rightPriority;
      })
      .slice(0, snapshot.settings.lastSessionGoal || 20)
      .map((location) => location.word.id);
  });
  const queue = useMemo(() => {
    const byId = new Map(
      vocabularyRepository
        .getEnabledWords(snapshot)
        .map((location) => [location.word.id, location]),
    );
    return sessionWordIds.flatMap((id) => {
      const location = byId.get(id);
      return location ? [location] : [];
    });
  }, [sessionWordIds, snapshot]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startedAt = useRef(Date.now());
  const current = queue[index] ?? null;

  const rate = (action: ReviewAction, label: string) => {
    if (!current) {
      return;
    }
    const responseSeconds = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
    const progress = applyReviewAction(
      snapshot.progress[current.word.id],
      current.word.id,
      action,
      new Date().toISOString(),
      responseSeconds,
    );
    vocabularyRepository.setProgress(
      current.word.id,
      progress,
      createReviewEvent(current, action, responseSeconds),
    );
    if (index + 1 >= queue.length) {
      studyRepository.addActivity(
        "vocabulary",
        "Completed vocabulary review",
        `${queue.length} words reviewed`,
      );
      onNotice(`Review complete: ${queue.length} words.`);
    }
    setIndex((value) => value + 1);
    setRevealed(false);
    startedAt.current = Date.now();
    onNotice(`${current.word.term}: ${label}`);
  };

  if (!current) {
    return (
      <section className="b-frame rev-done">
        <span className="brutal__title-mark" aria-hidden>
          <DoodleIcon name="trophy" size={30} />
        </span>
        <h2>{queue.length ? "Session complete" : "Nothing due"}</h2>
        <p>
          {queue.length
            ? `You reviewed ${queue.length} ${queue.length === 1 ? "word" : "words"}. The next due times are saved on this device.`
            : "Turn on a wordlist or add a personal word to start reviewing."}
        </p>
        {queue.length ? (
          <button
            type="button"
            className="b-btn b-btn--lime"
            onClick={() => window.location.reload()}
          >
            Go again
          </button>
        ) : null}
      </section>
    );
  }

  const seen = Boolean(snapshot.progress[current.word.id]?.timesSeen);
  const percent = Math.round((index / queue.length) * 100);

  return (
    <div className="rev">
      <div className="rev__main">
        <div className="b-frame rev-progress">
          <span className="rev-progress__count">
            {index + 1} / {queue.length}
          </span>
          <span
            className="rev-progress__track"
            role="progressbar"
            aria-label={`${index} of ${queue.length} cards complete`}
            aria-valuemin={0}
            aria-valuemax={queue.length}
            aria-valuenow={index}
          >
            <span className="rev-progress__fill" style={{ width: `${percent}%` }} />
          </span>
          <span className={`b-tag ${seen ? "b-tag--sky" : "b-tag--rose"}`}>
            {seen ? "Review" : "New"}
          </span>
        </div>

        <article className="b-frame rev-card">
          <div className="rev-card__top">
            <div className="rev-card__term">
              <h2>{current.word.term}</h2>
              {current.word.pronunciation ? (
                <p className="rev-card__phonetic">{current.word.pronunciation}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="b-icon-btn"
              onClick={() => speakVocabulary(current.word.term, snapshot.settings)}
              aria-label={`Pronounce ${current.word.term}`}
            >
              <DoodleIcon name="speaker" size={21} />
            </button>
          </div>

          {revealed ? (
            <div className="rev-answer">
              <p className="rev-answer__meaning">
                {current.word.shortMeaning || "No meaning recorded"}
              </p>
              {current.word.exampleSentences[0] ? (
                <p className="rev-answer__example">“{current.word.exampleSentences[0]}”</p>
              ) : null}
              {current.word.collocations?.length ? (
                <ul className="rev-answer__chips">
                  {current.word.collocations.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            /* Recall has to happen before the answer appears, so the hidden
               state is a target you hit rather than a blank space. */
            <button type="button" className="rev-reveal" onClick={() => setRevealed(true)}>
              <DoodleIcon name="bulb" size={30} />
              <strong>Show meaning</strong>
              <small>Say it out loud first, then check.</small>
            </button>
          )}
        </article>

        <div className="rev-ratings">
          <button
            type="button"
            className="b-btn b-btn--flame rev-rating"
            disabled={!revealed}
            onClick={() => rate("skipped", "Again")}
          >
            <strong>Again</strong>
            <small>under 5 min</small>
          </button>
          <button
            type="button"
            className="b-btn b-btn--rose rev-rating"
            disabled={!revealed}
            onClick={() => rate("later", "Hard")}
          >
            <strong>Hard</strong>
            <small>10 min</small>
          </button>
          <button
            type="button"
            className="b-btn b-btn--sky rev-rating"
            disabled={!revealed}
            onClick={() => rate("known", "Good")}
          >
            <strong>Good</strong>
            <small>1+ day</small>
          </button>
          <button
            type="button"
            className="b-btn b-btn--mint rev-rating"
            disabled={!revealed}
            onClick={() => rate("known", "Easy")}
          >
            <strong>Easy</strong>
            <small>2+ days</small>
          </button>
        </div>
      </div>

      <aside className="rev__side">
        <section className="b-frame rev-stat">
          <h3>Session</h3>
          <div
            className="rev-dial"
            style={{ "--dial": `${percent * 3.6}deg` } as React.CSSProperties}
            aria-hidden
          >
            <span>{percent}%</span>
          </div>
          <dl className="rev-tally">
            <div>
              <dt>Done</dt>
              <dd>{index}</dd>
            </div>
            <div>
              <dt>Left</dt>
              <dd>{queue.length - index}</dd>
            </div>
          </dl>
        </section>

        <section className="b-frame b-frame--sun rev-reminder">
          <h3>
            <DoodleIcon name="bell" size={18} />
            Reminders
          </h3>
          <p>
            Every {snapshot.settings.reminderIntervalMinutes} min ·{" "}
            {snapshot.settings.notificationMode === "off" ? "paused" : "active"}
          </p>
          <button
            type="button"
            className="b-btn b-btn--block"
            onClick={() => {
              vocabularyRepository.pauseReminders(60);
              onNotice("Vocabulary reminders paused for one hour.");
            }}
          >
            Pause 1 hour
          </button>
        </section>
      </aside>
    </div>
  );
}
