import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatCount } from "../lib/format";
import { speakVocabulary } from "../services/vocabularyBrowser";
import {
  createEmptyProgress,
  createReviewEvent,
  normalizeVocabularyTerm,
  vocabularyRepository,
  type PersonalWordDraft,
  type VocabularySnapshot,
  type WordLocation,
} from "../services/vocabularyRepository";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { WordList } from "../types/vocabulary";
import { DoodleIcon } from "./DoodleIcon";
import { Modal } from "./Modal";
import { ConfirmDialog } from "./StudyUI";
import {
  formatDue,
  getLibraryDisplayTitle,
  getStudyStatus,
  isPersianText,
  StatusTag,
  WordInspector,
  type StudyStatus,
} from "./VocabularyLibraryPanels";
import "../vocabulary-library.css";

interface VocabularyLibraryProps {
  snapshot: VocabularySnapshot;
  onNotice: (message: string) => void;
  onOpenSettings: () => void;
  onOpenReview?: () => void;
  initialWordId?: string;
}

type StatusFilter = "all" | StudyStatus;
type DuplicatePolicy = "keep" | "skip";
type Confirmation =
  | { kind: "word"; location: WordLocation }
  | { kind: "collection"; list: WordList };

const WORDS_PER_PAGE = 20;
const MAX_IMPORT_BYTES = 5_000_000;
const EMPTY_DRAFT: PersonalWordDraft = {
  term: "",
  partOfSpeech: "",
  pronunciation: "",
  shortMeaning: "",
  exampleSentence: "",
  collocations: [],
  notes: "",
};

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "learned", label: "Learned" },
  { value: "difficult", label: "Difficult" },
];

interface ImportPreviewWord {
  index: number;
  term: string;
  partOfSpeech: string | null;
  shortMeaning: string | null;
  duplicate: boolean;
  duplicateSource: "library" | "file" | null;
}

interface ImportAnalysis {
  title: string | null;
  rawWordCount: number;
  words: ImportPreviewWord[];
  malformedEntries: number[];
  duplicateCount: number;
  blockingIssues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  return cleaned.length ? cleaned : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The action could not finish.";
}

function downloadText(contents: string, name: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads a candidate file without touching the library, so the dialog can show
 *  exactly what an import would do before anything is written. */
function analyzeImport(value: unknown, snapshot: VocabularySnapshot): ImportAnalysis {
  const analysis: ImportAnalysis = {
    title: null,
    rawWordCount: 0,
    words: [],
    malformedEntries: [],
    duplicateCount: 0,
    blockingIssues: [],
  };

  if (!isRecord(value)) {
    analysis.blockingIssues.push("The file must contain one JSON wordlist object.");
    return analysis;
  }

  if (value.schemaVersion !== 1) {
    analysis.blockingIssues.push("The wordlist must use schemaVersion 1.");
  }

  const id = cleanText(value.id);
  analysis.title = cleanText(value.title);
  if (!id) {
    analysis.blockingIssues.push("Add a non-empty wordlist ID.");
  }
  if (!analysis.title) {
    analysis.blockingIssues.push("Add a non-empty wordlist title.");
  }
  if (!Array.isArray(value.words)) {
    analysis.blockingIssues.push("The wordlist needs a words array.");
    return analysis;
  }

  analysis.rawWordCount = value.words.length;
  if (id && snapshot.wordLists.some((list) => list.id === id)) {
    analysis.blockingIssues.push(`A collection with the ID “${id}” already exists.`);
  }

  const existingIds = new Set(
    snapshot.wordLists.flatMap((list) => list.words.map((word) => word.id.toLocaleLowerCase())),
  );
  const existingTerms = new Set(
    snapshot.wordLists.flatMap((list) =>
      list.words.map((word) => normalizeVocabularyTerm(word.term)),
    ),
  );
  const candidateIds = new Set<string>();
  const candidateTerms = new Set<string>();
  const idIssues: string[] = [];

  value.words.forEach((rawWord, index) => {
    if (!isRecord(rawWord)) {
      analysis.malformedEntries.push(index + 1);
      return;
    }

    const term = cleanText(rawWord.term);
    if (!term) {
      analysis.malformedEntries.push(index + 1);
      return;
    }

    const wordId =
      cleanText(rawWord.id) ?? `${id ?? "wordlist"}-${String(index + 1).padStart(3, "0")}`;
    const normalizedId = wordId.toLocaleLowerCase();
    if (candidateIds.has(normalizedId)) {
      idIssues.push(`Word ID “${wordId}” appears more than once in this file.`);
    } else if (existingIds.has(normalizedId)) {
      idIssues.push(`Word ID “${wordId}” is already in the library.`);
    }
    candidateIds.add(normalizedId);

    const normalizedTerm = normalizeVocabularyTerm(term);
    const duplicateSource = existingTerms.has(normalizedTerm)
      ? "library"
      : candidateTerms.has(normalizedTerm)
        ? "file"
        : null;
    if (duplicateSource) {
      analysis.duplicateCount += 1;
    }
    candidateTerms.add(normalizedTerm);

    analysis.words.push({
      index: index + 1,
      term,
      partOfSpeech: cleanText(rawWord.partOfSpeech),
      shortMeaning: cleanText(rawWord.shortMeaning),
      duplicate: duplicateSource !== null,
      duplicateSource,
    });
  });

  if (!analysis.words.length) {
    analysis.blockingIssues.push("No valid words were found. Every word needs a non-empty term.");
  }
  analysis.blockingIssues.push(...idIssues.slice(0, 4));
  if (idIssues.length > 4) {
    analysis.blockingIssues.push(`${idIssues.length - 4} more word ID conflicts must be fixed.`);
  }

  return analysis;
}

export function VocabularyLibrary({
  snapshot,
  onNotice,
  onOpenSettings,
  onOpenReview,
  initialWordId,
}: VocabularyLibraryProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(initialWordId ?? null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [wordModalOpen, setWordModalOpen] = useState(false);
  const [editing, setEditing] = useState<WordLocation | null>(null);
  const [draft, setDraft] = useState<PersonalWordDraft>(EMPTY_DRAFT);
  const [targetListId, setTargetListId] = useState(vocabularyRepository.personalListId);
  const [wordError, setWordError] = useState("");
  const [saving, setSaving] = useState(false);

  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState("");
  const [collectionError, setCollectionError] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importValue, setImportValue] = useState<unknown | undefined>(undefined);
  const [importError, setImportError] = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("skip");

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const isNarrow = useMediaQuery("(max-width: 1180px)");
  const searchId = useId();
  const collectionId = useId();
  const policyName = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);
  const newCollectionRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = useRef<string | null>(null);
  const appliedInitialRef = useRef<string | undefined>(undefined);

  const locations = useMemo(() => vocabularyRepository.getAllWords(snapshot), [snapshot]);

  /* Counts belong to the set the status filter will act on, so "Due 12" and a
     Due list of 12 can never disagree while a search is active. */
  const scoped = useMemo(
    () =>
      locations.filter((location) => {
        if (collectionFilter !== "all" && location.list.id !== collectionFilter) {
          return false;
        }
        if (!deferredQuery) {
          return true;
        }
        return [
          location.word.term,
          location.word.shortMeaning,
          location.word.partOfSpeech,
          location.word.notes,
          ...location.word.tags,
          ...(location.word.collocations ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(deferredQuery);
      }),
    [collectionFilter, deferredQuery, locations],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: scoped.length,
      learning: 0,
      due: 0,
      learned: 0,
      difficult: 0,
    };
    for (const location of scoped) {
      counts[getStudyStatus(snapshot.progress[location.word.id])] += 1;
    }
    return counts;
  }, [scoped, snapshot.progress]);

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? scoped
        : scoped.filter(
            (location) => getStudyStatus(snapshot.progress[location.word.id]) === statusFilter,
          ),
    [scoped, snapshot.progress, statusFilter],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / WORDS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleWords = filtered.slice(safePage * WORDS_PER_PAGE, (safePage + 1) * WORDS_PER_PAGE);
  const selected =
    filtered.find((location) => location.word.id === selectedWordId) ?? visibleWords[0] ?? null;
  const selectedProgress = selected ? snapshot.progress[selected.word.id] : undefined;

  const reviewCount = useMemo(() => {
    const now = Date.now();
    return vocabularyRepository.getEnabledWords(snapshot).filter((location) => {
      const progress = snapshot.progress[location.word.id];
      return !progress || progress.timesSeen === 0 || Date.parse(progress.dueAt) <= now;
    }).length;
  }, [snapshot]);

  const editableLists = snapshot.wordLists.filter((list) => !list.isBuiltIn);
  const importAnalysis = useMemo(
    () => (importValue === undefined ? null : analyzeImport(importValue, snapshot)),
    [importValue, snapshot],
  );
  const importableCount = importAnalysis
    ? importAnalysis.words.length - (duplicatePolicy === "skip" ? importAnalysis.duplicateCount : 0)
    : 0;

  useEffect(() => {
    if (!initialWordId || appliedInitialRef.current === initialWordId) {
      return;
    }
    const index = filtered.findIndex((location) => location.word.id === initialWordId);
    if (index >= 0) {
      appliedInitialRef.current = initialWordId;
      setSelectedWordId(initialWordId);
      setPage(Math.floor(index / WORDS_PER_PAGE));
    }
  }, [filtered, initialWordId]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending || !visibleWords.some((location) => location.word.id === pending)) {
      return;
    }
    pendingFocusRef.current = null;
    window.requestAnimationFrame(() => {
      const node = rowRefs.current.get(pending);
      node?.focus({ preventScroll: true });
      node?.scrollIntoView({ block: "nearest" });
    });
  }, [visibleWords]);

  const resetPaging = () => {
    setPage(0);
    setSelectedWordId(null);
  };

  const selectWord = (location: WordLocation) => {
    setSelectedWordId(location.word.id);
    if (isNarrow) {
      setDetailOpen(true);
    }
  };

  /* Arrow keys walk the whole filtered list, not just the visible page, so the
     keyboard reaches the next page instead of stopping at row twenty. */
  const focusWordAt = (index: number) => {
    const bounded = Math.max(0, Math.min(index, filtered.length - 1));
    const location = filtered[bounded];
    if (!location) {
      return;
    }
    pendingFocusRef.current = location.word.id;
    setSelectedWordId(location.word.id);
    setPage(Math.floor(bounded / WORDS_PER_PAGE));
  };

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, indexOnPage: number) => {
    const globalIndex = safePage * WORDS_PER_PAGE + indexOnPage;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        next = globalIndex + 1;
        break;
      case "ArrowUp":
        next = globalIndex - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = filtered.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    focusWordAt(next);
  };

  const markLearned = (location: WordLocation) => {
    const current = snapshot.progress[location.word.id] ?? createEmptyProgress(location.word.id);
    vocabularyRepository.setProgress(
      location.word.id,
      {
        ...current,
        timesSeen: Math.max(5, current.timesSeen),
        timesKnown: Math.max(5, current.timesKnown),
        consecutiveCorrect: Math.max(5, current.consecutiveCorrect),
        memoryDifficulty: Math.min(3, current.memoryDifficulty),
        lapses: 0,
        lastReviewedAt: new Date().toISOString(),
        dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
      createReviewEvent(location, "known", 0),
    );
    onNotice(`${location.word.term} was marked as learned.`);
  };

  const markDifficult = (location: WordLocation) => {
    const current = snapshot.progress[location.word.id] ?? createEmptyProgress(location.word.id);
    vocabularyRepository.setProgress(
      location.word.id,
      {
        ...current,
        timesSeen: Math.max(1, current.timesSeen),
        timesSkipped: current.timesSkipped + 1,
        lapses: Math.max(2, current.lapses + 1),
        memoryDifficulty: Math.max(8, current.memoryDifficulty),
        lastReviewedAt: new Date().toISOString(),
        dueAt: new Date().toISOString(),
      },
      createReviewEvent(location, "skipped", 0),
    );
    onNotice(`${location.word.term} was added to difficult words.`);
  };

  const openAdd = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setTargetListId(
      collectionFilter !== "all" && editableLists.some((list) => list.id === collectionFilter)
        ? collectionFilter
        : vocabularyRepository.personalListId,
    );
    setWordError("");
    setWordModalOpen(true);
  };

  const openEdit = (location: WordLocation) => {
    setEditing(location);
    setTargetListId(location.list.id);
    setDraft({
      term: location.word.term,
      partOfSpeech: location.word.partOfSpeech ?? "",
      pronunciation: location.word.pronunciation ?? "",
      shortMeaning: location.word.shortMeaning ?? "",
      exampleSentence: location.word.exampleSentences[0] ?? "",
      collocations: location.word.collocations ?? [],
      notes: location.word.notes ?? "",
    });
    setWordError("");
    setWordModalOpen(true);
  };

  const saveWord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    if (!draft.term.trim()) {
      setWordError("Enter a word before saving it.");
      termInputRef.current?.focus();
      return;
    }

    setSaving(true);
    setWordError("");
    try {
      if (editing) {
        vocabularyRepository.updateEditableWord(editing.list.id, editing.word.id, draft);
        setSelectedWordId(editing.word.id);
        onNotice(`${draft.term.trim()} was updated.`);
      } else {
        const word = await vocabularyRepository.addWordToList(draft, targetListId);
        setSelectedWordId(word.id);
        setQuery("");
        setStatusFilter("all");
        setCollectionFilter(targetListId);
        setPage(0);
        onNotice(`${word.term} was added to your library.`);
      }
      setWordModalOpen(false);
      setDraft(EMPTY_DRAFT);
      setEditing(null);
    } catch (error) {
      setWordError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const createCollection = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const list = vocabularyRepository.createWordList(newCollectionTitle);
      setNewCollectionTitle("");
      setCollectionError("");
      setCollectionFilter(list.id);
      resetPaging();
      onNotice(`${list.title} was created.`);
    } catch (error) {
      setCollectionError(errorMessage(error));
    }
  };

  const toggleCollection = (list: WordList, enabled: boolean) => {
    try {
      vocabularyRepository.setListEnabled(list.id, enabled);
      onNotice(`${list.title} is ${enabled ? "included in" : "excluded from"} review sessions.`);
    } catch (error) {
      onNotice(`Could not update ${list.title}. ${errorMessage(error)}`);
    }
  };

  const exportCollection = (list: WordList) => {
    try {
      downloadText(
        vocabularyRepository.exportWordList(list.id),
        `${list.id.replace(/[^a-z0-9_-]+/gi, "-")}.wordlist.json`,
      );
      onNotice(`${list.title} was exported.`);
    } catch (error) {
      onNotice(`Export failed. ${errorMessage(error)}`);
    }
  };

  const resetImport = () => {
    setImportFileName("");
    setImportValue(undefined);
    setImportError("");
    setDuplicatePolicy("skip");
  };

  const readImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setImportFileName(file.name);
    setImportValue(undefined);
    setImportError("");

    if (!file.name.toLocaleLowerCase().endsWith(".json")) {
      setImportError("Choose a .json or .wordlist.json file.");
      return;
    }
    if (file.size === 0) {
      setImportError("The selected file is empty.");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError("Choose a JSON wordlist smaller than 5 MB.");
      return;
    }

    try {
      const text = (await file.text()).replace(/^﻿/u, "");
      setImportValue(JSON.parse(text) as unknown);
    } catch (error) {
      setImportError(
        error instanceof SyntaxError
          ? "The file is not valid JSON. Fix its syntax and choose it again."
          : `The file could not be read. ${errorMessage(error)}`,
      );
    }
  };

  const runImport = () => {
    if (
      importValue === undefined ||
      !importAnalysis ||
      importAnalysis.blockingIssues.length ||
      importableCount < 1 ||
      importSaving
    ) {
      return;
    }

    setImportSaving(true);
    setImportError("");
    try {
      const result = vocabularyRepository.importWordList(importValue, duplicatePolicy === "skip");
      setCollectionFilter(result.list.id);
      resetPaging();
      setImportOpen(false);
      resetImport();
      onNotice(
        `${result.list.title} was imported with ${formatCount(result.list.words.length, "word")}.${
          result.skippedDuplicates
            ? ` ${formatCount(result.skippedDuplicates, "duplicate")} skipped.`
            : ""
        }`,
      );
    } catch (error) {
      setImportError(`Import failed. ${errorMessage(error)}`);
    } finally {
      setImportSaving(false);
    }
  };

  const confirmDeletion = () => {
    if (!confirmation) {
      return;
    }
    try {
      if (confirmation.kind === "word") {
        vocabularyRepository.deleteEditableWord(
          confirmation.location.list.id,
          confirmation.location.word.id,
        );
        setSelectedWordId(null);
        setDetailOpen(false);
        onNotice(`${confirmation.location.word.term} was deleted. Its review history was kept.`);
      } else {
        vocabularyRepository.deleteImportedList(confirmation.list.id);
        setCollectionFilter("all");
        resetPaging();
        onNotice(`${confirmation.list.title} was deleted. Its review history was kept.`);
      }
      setConfirmation(null);
    } catch (error) {
      onNotice(errorMessage(error));
      setConfirmation(null);
    }
  };

  const inspectorActions = {
    onSpeak: () => {
      if (selected) {
        speakVocabulary(selected.word.term, snapshot.settings);
      }
    },
    onEdit: () => {
      if (selected) {
        setDetailOpen(false);
        openEdit(selected);
      }
    },
    onDelete: () => {
      if (selected) {
        setConfirmation({ kind: "word", location: selected });
      }
    },
    onMarkLearned: () => {
      if (selected) {
        markLearned(selected);
      }
    },
    onMarkDifficult: () => {
      if (selected) {
        markDifficult(selected);
      }
    },
  };

  const rangeStart = filtered.length ? safePage * WORDS_PER_PAGE + 1 : 0;
  const rangeEnd = Math.min((safePage + 1) * WORDS_PER_PAGE, filtered.length);

  const confirmCopy =
    confirmation?.kind === "collection"
      ? {
          title: "Delete this collection?",
          description: `“${confirmation.list.title}” and its ${formatCount(confirmation.list.words.length, "word")} leave the library. Review history is kept.`,
          confirmLabel: "Delete collection",
        }
      : {
          title: "Delete this word?",
          description: `“${confirmation?.location.word.term ?? ""}” leaves this collection. Review history is kept.`,
          confirmLabel: "Delete word",
        };

  return (
    <div className="brutal vlib">
      <header className="brutal__head">
        <div className="brutal__title">
          <span className="brutal__title-mark">
            <DoodleIcon name="doc" size={28} />
          </span>
          <div>
            <h1>Library</h1>
            <p className="b-eyebrow">
              {formatCount(locations.length, "word")} ·{" "}
              {formatCount(snapshot.wordLists.length, "collection")}
            </p>
          </div>
        </div>

        <div className="brutal__head-actions">
          <div className="b-switch" role="tablist" aria-label="Vocabulary view">
            <button type="button" role="tab" aria-selected data-active="true">
              Library
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              data-active={false}
              onClick={onOpenReview}
              disabled={!onOpenReview}
            >
              Review {reviewCount}
            </button>
          </div>

          <button type="button" className="b-btn" onClick={() => setImportOpen(true)}>
            <DoodleIcon name="upload" size={17} />
            Import
          </button>
          <button type="button" className="b-btn b-btn--lime" onClick={openAdd}>
            <DoodleIcon name="folder-add" size={17} />
            Add word
          </button>
          <button
            type="button"
            className="b-icon-btn"
            onClick={onOpenSettings}
            aria-label="Reminder settings"
            title="Reminder settings"
          >
            <DoodleIcon name="bell" size={20} />
          </button>
        </div>
      </header>

      <div className="brutal__body vlib__body">
        <section className="b-frame vlib__list" aria-label="Vocabulary words">
          <div className="vlib__filters">
            <div className="vlib__filter-row">
              <label className="b-field vlib__search" htmlFor={searchId}>
                <DoodleIcon name="search" size={17} />
                <span className="sr-only">Search vocabulary</span>
                <input
                  ref={searchInputRef}
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    resetPaging();
                  }}
                  placeholder="Search words, meanings, or tags…"
                />
              </label>
              <label className="b-field vlib__collection" htmlFor={collectionId}>
                <span className="sr-only">Filter by collection</span>
                <select
                  id={collectionId}
                  value={collectionFilter}
                  onChange={(event) => {
                    setCollectionFilter(event.target.value);
                    resetPaging();
                  }}
                >
                  <option value="all">All collections</option>
                  {snapshot.wordLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {getLibraryDisplayTitle(list)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="b-btn vlib__collections-btn"
                onClick={() => {
                  setCollectionError("");
                  setCollectionsOpen(true);
                }}
              >
                <DoodleIcon name="filter" size={16} />
                Collections
              </button>
            </div>

            <div className="vlib__filter-row">
              <fieldset className="b-switch vlib__status-filter">
                <legend className="sr-only">Filter by status</legend>
                {STATUS_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    data-active={statusFilter === option.value}
                    aria-pressed={statusFilter === option.value}
                    onClick={() => {
                      setStatusFilter(option.value);
                      resetPaging();
                    }}
                  >
                    {option.label}
                    <span>{statusCounts[option.value]}</span>
                  </button>
                ))}
              </fieldset>
              <p className="vlib__result-count" role="status">
                {filtered.length
                  ? `${rangeStart}–${rangeEnd} of ${formatCount(filtered.length, "word")}`
                  : "No matches"}
              </p>
            </div>
          </div>

          {visibleWords.length ? (
            <>
              <div className="b-scroll vlib__scroll">
                <table className="vlib__table">
                  <caption className="sr-only">
                    Vocabulary words. Focus a term, then use the arrow keys, Home, and End to move
                    between rows.
                  </caption>
                  <colgroup>
                    <col style={{ width: "34%" }} />
                    <col />
                    <col style={{ width: "126px" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Word</th>
                      <th scope="col">Meaning</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWords.map((location, index) => {
                      const progress = snapshot.progress[location.word.id];
                      const isSelected = selected?.word.id === location.word.id;
                      const meaningIsPersian = isPersianText(location.word.shortMeaning);
                      return (
                        <tr
                          key={location.word.id}
                          className="vlib__row"
                          data-selected={isSelected}
                          onClick={() => selectWord(location)}
                        >
                          <th scope="row" className="vlib__term-cell">
                            <span className="vlib__term-row">
                              <button
                                ref={(node) => {
                                  if (node) {
                                    rowRefs.current.set(location.word.id, node);
                                  } else {
                                    rowRefs.current.delete(location.word.id);
                                  }
                                }}
                                type="button"
                                className="vlib__word"
                                tabIndex={isSelected ? 0 : -1}
                                aria-pressed={isSelected}
                                onClick={() => selectWord(location)}
                                onKeyDown={(event) => onRowKeyDown(event, index)}
                              >
                                {location.word.term}
                              </button>
                              <button
                                type="button"
                                className="vlib__speak"
                                tabIndex={isSelected ? 0 : -1}
                                aria-label={`Pronounce ${location.word.term}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  speakVocabulary(location.word.term, snapshot.settings);
                                }}
                              >
                                <DoodleIcon name="speaker" size={14} />
                              </button>
                            </span>
                            <small className="vlib__term-meta">
                              {[getLibraryDisplayTitle(location.list), location.word.partOfSpeech]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </th>
                          <td
                            className="vlib__meaning"
                            data-empty={!location.word.shortMeaning}
                            dir={meaningIsPersian ? "rtl" : "ltr"}
                          >
                            {location.word.shortMeaning || "No meaning yet"}
                          </td>
                          <td className="vlib__status-cell">
                            <StatusTag status={getStudyStatus(progress)} />
                            <small>{formatDue(progress?.dueAt)}</small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <footer className="vlib__pager">
                <p>
                  Page {safePage + 1} of {pageCount}
                </p>
                <div className="vlib__pager-controls">
                  <button
                    type="button"
                    className="b-btn"
                    disabled={safePage === 0}
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                  >
                    Previous
                  </button>
                  <span className="vlib__pager-position">
                    {safePage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="b-btn"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                  >
                    Next
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="vlib__empty">
              <DoodleIcon name="search" size={40} />
              <h3>{query.trim() ? `Nothing matches “${query.trim()}”` : "Nothing in this view"}</h3>
              <p>
                {query.trim()
                  ? "Try a shorter term, or clear the search and pick another collection."
                  : "Change the status filter, or add a word to one of your own collections."}
              </p>
              {query.trim() ? (
                <button
                  type="button"
                  className="b-btn b-btn--lime"
                  onClick={() => {
                    setQuery("");
                    resetPaging();
                    window.requestAnimationFrame(() => searchInputRef.current?.focus());
                  }}
                >
                  Clear search
                </button>
              ) : (
                <button type="button" className="b-btn b-btn--lime" onClick={openAdd}>
                  Add a word
                </button>
              )}
            </div>
          )}
        </section>

        {isNarrow ? null : (
          <WordInspector location={selected} progress={selectedProgress} {...inspectorActions} />
        )}
      </div>

      <Modal
        open={isNarrow && detailOpen && selected !== null}
        title={selected?.word.term ?? "Word details"}
        description="Meaning, example, collocations, notes, and review history."
        onClose={() => setDetailOpen(false)}
      >
        <WordInspector
          location={selected}
          progress={selectedProgress}
          embedded
          {...inspectorActions}
        />
      </Modal>

      <Modal
        open={wordModalOpen}
        title={editing ? "Edit word" : "Add a word"}
        description="Keep each entry short enough to review in a few seconds."
        onClose={() => setWordModalOpen(false)}
        initialFocusRef={termInputRef}
        size="wide"
      >
        <form className="modal-form" onSubmit={(event) => void saveWord(event)}>
          {editing ? null : (
            <label>
              Collection
              <select
                value={targetListId}
                onChange={(event) => setTargetListId(event.target.value)}
              >
                {editableLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="form-grid form-grid--two">
            <label>
              Word or collocation
              <input
                ref={termInputRef}
                required
                maxLength={120}
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
                  setDraft((current) => ({ ...current, partOfSpeech: event.target.value }))
                }
                placeholder="noun, verb, phrase…"
              />
            </label>
          </div>
          <label>
            Meaning
            <textarea
              rows={2}
              maxLength={500}
              value={draft.shortMeaning}
              onChange={(event) =>
                setDraft((current) => ({ ...current, shortMeaning: event.target.value }))
              }
              placeholder="Write it in your own words."
            />
          </label>
          <div className="form-grid form-grid--two">
            <label>
              Pronunciation
              <input
                value={draft.pronunciation}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, pronunciation: event.target.value }))
                }
                placeholder="/ˈeksəmpl/"
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
                setDraft((current) => ({ ...current, exampleSentence: event.target.value }))
              }
            />
          </label>
          <label>
            Notes
            <textarea
              rows={2}
              maxLength={1000}
              value={draft.notes}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="A memory cue, or the sentence you first met it in."
            />
          </label>
          {wordError ? (
            <p className="vlib-alert" role="alert">
              {wordError}
            </p>
          ) : null}
          <footer className="modal-actions">
            <button type="button" className="b-btn" onClick={() => setWordModalOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="b-btn b-btn--lime"
              disabled={saving || !draft.term.trim()}
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add to library"}
            </button>
          </footer>
        </form>
      </Modal>

      <Modal
        open={collectionsOpen}
        title="Collections"
        description="Create a collection, choose which ones feed review, or take one out of the app."
        onClose={() => setCollectionsOpen(false)}
        initialFocusRef={newCollectionRef}
      >
        <div className="vlib-collections">
          <form className="vlib-collections__create" onSubmit={createCollection}>
            <label>
              New collection
              <input
                ref={newCollectionRef}
                required
                maxLength={80}
                value={newCollectionTitle}
                onChange={(event) => setNewCollectionTitle(event.target.value)}
                placeholder="Reading notes, Environment…"
              />
            </label>
            <button type="submit" className="b-btn" disabled={!newCollectionTitle.trim()}>
              Create
            </button>
          </form>

          {collectionError ? (
            <p className="vlib-alert" role="alert">
              {collectionError}
            </p>
          ) : null}

          <ul className="vlib-collections__list">
            {snapshot.wordLists.map((list) => (
              <li key={list.id} className="vlib-collections__item">
                <span className="vlib-collections__copy">
                  <strong>{getLibraryDisplayTitle(list)}</strong>
                  <small>
                    {formatCount(list.words.length, "word")} ·{" "}
                    {list.isBuiltIn ? "Built in" : "Yours"}
                  </small>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="vlib-collections__switch"
                  aria-checked={list.isEnabled}
                  aria-label={`Review enabled for ${list.title}`}
                  onClick={() => toggleCollection(list, !list.isEnabled)}
                >
                  <span />
                </button>
                <span className="vlib-collections__actions">
                  <button
                    type="button"
                    className="b-icon-btn"
                    aria-label={`Export ${list.title}`}
                    title="Export as JSON"
                    onClick={() => exportCollection(list)}
                  >
                    <DoodleIcon name="download" size={17} />
                  </button>
                  {list.isBuiltIn || list.id === vocabularyRepository.personalListId ? null : (
                    <button
                      type="button"
                      className="b-icon-btn"
                      aria-label={`Delete ${list.title}`}
                      title="Delete collection"
                      onClick={() => {
                        setCollectionsOpen(false);
                        setConfirmation({ kind: "collection", list });
                      }}
                    >
                      <DoodleIcon name="delete" size={17} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        title="Import a collection"
        description="Choose a file, check what it would add, then confirm."
        onClose={() => {
          setImportOpen(false);
          resetImport();
        }}
        size="wide"
      >
        <div className="vlib-import">
          <label className="vlib-import__picker">
            <DoodleIcon name="upload" size={22} />
            <span>
              <strong>{importFileName || "Choose a JSON wordlist"}</strong>
              <small>Up to 5 MB · .json or .wordlist.json</small>
            </span>
            <input
              type="file"
              accept=".json,.wordlist.json,application/json"
              onChange={(event) => void readImportFile(event)}
            />
          </label>

          <p className="vlib-import__format">
            A custom file needs <code>schemaVersion</code>, <code>id</code>, <code>title</code>, and
            a <code>words</code> array. Every word needs a <code>term</code>; the rest is optional.
          </p>

          {importError ? (
            <p className="vlib-alert" role="alert">
              {importError}
            </p>
          ) : null}

          {importAnalysis ? (
            <>
              <dl className="vlib-import__summary">
                <div>
                  <dt>Valid</dt>
                  <dd>{importAnalysis.words.length}</dd>
                </div>
                <div data-warn={importAnalysis.malformedEntries.length > 0}>
                  <dt>Malformed</dt>
                  <dd>{importAnalysis.malformedEntries.length}</dd>
                </div>
                <div data-warn={importAnalysis.duplicateCount > 0}>
                  <dt>Duplicates</dt>
                  <dd>{importAnalysis.duplicateCount}</dd>
                </div>
                <div data-good={importableCount > 0}>
                  <dt>Will import</dt>
                  <dd>{Math.max(0, importableCount)}</dd>
                </div>
              </dl>

              {importAnalysis.blockingIssues.length ? (
                <div className="vlib-alert vlib-alert--list" role="alert">
                  <strong>Fix these before importing</strong>
                  <ul>
                    {importAnalysis.blockingIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {importAnalysis.malformedEntries.length ? (
                <p className="vlib-alert vlib-alert--warn">
                  {`Entries ${importAnalysis.malformedEntries
                    .slice(0, 6)
                    .map((entry) => `#${entry}`)
                    .join(", ")}${
                    importAnalysis.malformedEntries.length > 6 ? " and more" : ""
                  } have no usable term and will be ignored.`}
                </p>
              ) : null}

              {importAnalysis.words.length ? (
                <div className="vlib-import__preview">
                  <table>
                    <caption className="sr-only">Preview of the first imported words</caption>
                    <thead>
                      <tr>
                        <th scope="col">Word</th>
                        <th scope="col">Type</th>
                        <th scope="col">Meaning</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importAnalysis.words.slice(0, 8).map((word) => (
                        <tr key={`${word.index}-${word.term}`}>
                          <th scope="row">{word.term}</th>
                          <td>{word.partOfSpeech || "—"}</td>
                          <td dir="auto">{word.shortMeaning || "No meaning"}</td>
                          <td>
                            {word.duplicate
                              ? `Duplicate in ${word.duplicateSource === "file" ? "file" : "library"}`
                              : "Ready"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {importAnalysis.duplicateCount ? (
                <fieldset className="vlib-import__policy">
                  <legend>Duplicate terms</legend>
                  <label>
                    <input
                      type="radio"
                      name={policyName}
                      checked={duplicatePolicy === "skip"}
                      onChange={() => setDuplicatePolicy("skip")}
                    />
                    <span>
                      Skip duplicates
                      <small>Recommended. Words already in the library stay as they are.</small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={policyName}
                      checked={duplicatePolicy === "keep"}
                      onChange={() => setDuplicatePolicy("keep")}
                    />
                    <span>
                      Keep duplicates
                      <small>Add every valid term, repeats included.</small>
                    </span>
                  </label>
                </fieldset>
              ) : null}

              {!importAnalysis.blockingIssues.length && importableCount < 1 ? (
                <p className="vlib-alert vlib-alert--warn" role="alert">
                  Every valid term is already in your library. Choose “Keep duplicates” or pick
                  another file.
                </p>
              ) : null}
            </>
          ) : null}

          <footer className="modal-actions">
            <button
              type="button"
              className="b-btn"
              onClick={() => {
                setImportOpen(false);
                resetImport();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="b-btn b-btn--lime"
              onClick={runImport}
              disabled={
                importSaving ||
                !importAnalysis ||
                importAnalysis.blockingIssues.length > 0 ||
                importableCount < 1
              }
            >
              {importSaving
                ? "Importing…"
                : importAnalysis
                  ? `Import ${formatCount(Math.max(0, importableCount), "word")}`
                  : "Choose a file first"}
            </button>
          </footer>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmation !== null}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        cancelLabel="Keep it"
        tone="danger"
        onClose={() => setConfirmation(null)}
        onConfirm={confirmDeletion}
      />
    </div>
  );
}
