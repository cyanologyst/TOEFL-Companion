import { CheckIcon } from "@phosphor-icons/react/Check";
import { ClipboardTextIcon } from "@phosphor-icons/react/ClipboardText";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon } from "@phosphor-icons/react/UploadSimple";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XIcon } from "@phosphor-icons/react/X";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatCount as pluralize } from "../lib/format";
import { speakVocabulary } from "../services/vocabularyBrowser";
import {
  createEmptyProgress,
  createReviewEvent,
  normalizeVocabularyTerm as normalizeTerm,
  vocabularyRepository,
  type PersonalWordDraft,
  type VocabularySnapshot,
} from "../services/vocabularyRepository";
import type { WordList } from "../types/vocabulary";
import { DoodleIcon } from "./DoodleIcon";
import {
  getLibraryDisplayTitle,
  isPersianText,
  ReviewStatusBadge,
  WordDetailsPanel,
  WordlistPanel,
} from "./VocabularyLibraryPanels";
import "../vocabulary-library.css";

interface VocabularyLibraryProps {
  snapshot: VocabularySnapshot;
  onNotice: (message: string) => void;
  onOpenSettings: () => void;
  initialWordId?: string;
}

type LibrarySort = "source" | "alphabetical" | "partOfSpeech" | "recent";
type DuplicatePolicy = "keep" | "skip";
type ImportPhase = "idle" | "reading" | "saving";
type ConfirmationTarget =
  | {
      kind: "word";
      id: string;
      label: string;
    }
  | {
      kind: "list";
      id: string;
      label: string;
      wordCount: number;
    };

interface ImportPreviewWord {
  index: number;
  term: string;
  partOfSpeech: string | null;
  shortMeaning: string | null;
  duplicate: boolean;
  duplicateSource: "library" | "file" | null;
}

interface ImportAnalysis {
  id: string | null;
  title: string | null;
  rawWordCount: number;
  words: ImportPreviewWord[];
  malformedEntries: number[];
  duplicateCount: number;
  blockingIssues: string[];
}

const WORD_BATCH_SIZE = 100;
const MAX_IMPORT_BYTES = 5_000_000;
const NAVIGATOR_MIN_WIDTH = 170;
const NAVIGATOR_MAX_WIDTH = 230;
const INSPECTOR_MIN_WIDTH = 270;
const INSPECTOR_MAX_WIDTH = 340;
const EMPTY_DRAFT: PersonalWordDraft = {
  term: "",
  partOfSpeech: "",
  pronunciation: "",
  shortMeaning: "",
  notes: "",
};

function readSessionNumber(key: string, fallback: number): number {
  const stored = window.sessionStorage.getItem(key);
  if (stored === null || stored.trim() === "") {
    return fallback;
  }
  const value = Number(stored);
  return Number.isFinite(value) && value >= 100 ? value : fallback;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
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

function compareText(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "", undefined, {
    sensitivity: "base",
  });
}

function formatRecentDate(value: string | null | undefined): string {
  if (!value) {
    return "Not reviewed";
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(parsed)
    : "Not reviewed";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The action could not finish.";
}

function findListForWord(wordId: string | undefined, wordLists: WordList[]): WordList | undefined {
  return wordId
    ? wordLists.find((list) => list.words.some((word) => word.id === wordId))
    : undefined;
}

function isClipboardWord(value: string): boolean {
  return (
    value.length >= 2 && value.length <= 40 && !/\s/u.test(value) && /^[\p{L}'-]+$/u.test(value)
  );
}

function analyzeImport(value: unknown, snapshot: VocabularySnapshot): ImportAnalysis {
  const analysis: ImportAnalysis = {
    id: null,
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

  analysis.id = cleanText(value.id);
  analysis.title = cleanText(value.title);
  if (!analysis.id) {
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
  if (analysis.id && snapshot.wordLists.some((list) => list.id === analysis.id)) {
    analysis.blockingIssues.push(`A wordlist with the ID “${analysis.id}” already exists.`);
  }

  const existingIds = new Set(
    snapshot.wordLists.flatMap((list) => list.words.map((word) => word.id.toLocaleLowerCase())),
  );
  const existingTerms = new Set(
    snapshot.wordLists.flatMap((list) => list.words.map((word) => normalizeTerm(word.term))),
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

    const id =
      cleanText(rawWord.id) ?? `${analysis.id ?? "wordlist"}-${String(index + 1).padStart(3, "0")}`;
    const normalizedId = id.toLocaleLowerCase();
    if (candidateIds.has(normalizedId)) {
      idIssues.push(`Word ID “${id}” appears more than once in this file.`);
    } else if (existingIds.has(normalizedId)) {
      idIssues.push(`Word ID “${id}” is already in the library.`);
    }
    candidateIds.add(normalizedId);

    const normalizedTerm = normalizeTerm(term);
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
  initialWordId,
}: VocabularyLibraryProps): React.JSX.Element {
  const initialList = findListForWord(initialWordId, snapshot.wordLists);
  const [selectedListId, setSelectedListId] = useState(
    initialList?.id ?? snapshot.wordLists[0]?.id ?? "",
  );
  const [selectedWordId, setSelectedWordId] = useState(initialWordId ?? "");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LibrarySort>("source");
  const [visibleCount, setVisibleCount] = useState(WORD_BATCH_SIZE);
  const [libraryStatus, setLibraryStatus] = useState("");
  const compactNavigator = useMediaQuery("(max-width: 980px)");
  const compactInspector = useMediaQuery("(max-width: 1160px)");
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(
    () => window.sessionStorage.getItem("toefl-library:navigator-collapsed") === "true",
  );
  const [inspectorCollapsed, setInspectorCollapsed] = useState(
    () => window.sessionStorage.getItem("toefl-library:inspector-collapsed") === "true",
  );
  const [navigatorDrawerOpen, setNavigatorDrawerOpen] = useState(false);
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [navigatorWidth, setNavigatorWidth] = useState(() =>
    readSessionNumber("toefl-library:v2:navigator-width", 180),
  );
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    readSessionNumber("toefl-library:v2:inspector-width", 280),
  );
  const [termColumnWidth, setTermColumnWidth] = useState(() =>
    readSessionNumber("toefl-library:v2:term-column-width", 145),
  );

  const [addOpen, setAddOpen] = useState(false);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonalWordDraft>(EMPTY_DRAFT);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [importFileName, setImportFileName] = useState("");
  const [importValue, setImportValue] = useState<unknown | undefined>(undefined);
  const [importError, setImportError] = useState("");
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("skip");

  const [confirmation, setConfirmation] = useState<ConfirmationTarget | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [newListError, setNewListError] = useState("");

  const rowButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingRowFocusRef = useRef<string | null>(null);
  const appliedInitialWordRef = useRef<string | undefined>(undefined);
  const addTermRef = useRef<HTMLInputElement>(null);
  const newListTitleRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreButtonRef = useRef<HTMLButtonElement>(null);
  const pendingLoadMoreFocusRef = useRef<string | null>(null);
  const primaryAddButtonRef = useRef<HTMLButtonElement>(null);
  const addTriggerRef = useRef<HTMLButtonElement | null>(null);
  const importTriggerRef = useRef<HTMLButtonElement | null>(null);
  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const importPolicyName = useId();
  const searchId = useId();
  const sortId = useId();
  const addTermId = useId();
  const addPartOfSpeechId = useId();
  const addPronunciationId = useId();
  const addMeaningId = useId();
  const addNotesId = useId();
  const newListTitleId = useId();

  const selectedList =
    snapshot.wordLists.find((list) => list.id === selectedListId) ?? snapshot.wordLists[0];
  const visibleWordLists = snapshot.wordLists.filter(
    (list) => list.id !== vocabularyRepository.personalListId || list.words.length > 0,
  );

  const filteredWords = useMemo(() => {
    if (!selectedList) {
      return [];
    }

    const query = search.trim().toLocaleLowerCase();
    const matches = selectedList.words.filter((word) => {
      if (!query) {
        return true;
      }

      return [
        word.term,
        word.partOfSpeech,
        word.shortMeaning,
        word.pronunciation,
        word.tags.join(" "),
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    });

    return [...matches].sort((left, right) => {
      switch (sort) {
        case "alphabetical":
          return compareText(left.term, right.term);
        case "partOfSpeech":
          return (
            compareText(left.partOfSpeech, right.partOfSpeech) || compareText(left.term, right.term)
          );
        case "recent": {
          const leftTime = Date.parse(snapshot.progress[left.id]?.lastReviewedAt ?? "");
          const rightTime = Date.parse(snapshot.progress[right.id]?.lastReviewedAt ?? "");
          return (
            (Number.isFinite(rightTime) ? rightTime : -1) -
              (Number.isFinite(leftTime) ? leftTime : -1) || compareText(left.term, right.term)
          );
        }
        default:
          return (
            (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
            compareText(left.term, right.term)
          );
      }
    });
  }, [search, selectedList, snapshot.progress, sort]);

  const displayedWords = useMemo(
    () => filteredWords.slice(0, visibleCount),
    [filteredWords, visibleCount],
  );
  const selectedWord =
    filteredWords.find((word) => word.id === selectedWordId) ?? displayedWords[0];
  const selectedProgress = selectedWord ? snapshot.progress[selectedWord.id] : undefined;
  const selectedCanEdit = !selectedList.isBuiltIn;
  const wordsWithPartOfSpeech = selectedList.words.filter((word) =>
    Boolean(word.partOfSpeech?.trim()),
  ).length;
  const hasPartOfSpeech =
    wordsWithPartOfSpeech > 0 && (selectedList.words.length <= 10 || wordsWithPartOfSpeech >= 3);
  const showPartOfSpeech = hasPartOfSpeech && !compactNavigator;
  const selectedListDueCount = selectedList.words.filter((word) => {
    const progress = snapshot.progress[word.id];
    return progress && progress.timesSeen > 0 && Date.parse(progress.dueAt) <= Date.now();
  }).length;
  const selectedListMasteredCount = selectedList.words.filter(
    (word) => (snapshot.progress[word.id]?.timesKnown ?? 0) >= 5,
  ).length;
  const remainingWords = Math.max(0, filteredWords.length - displayedWords.length);
  const importAnalysis = useMemo(
    () => (importValue === undefined ? null : analyzeImport(importValue, snapshot)),
    [importValue, snapshot],
  );
  const importableCount = importAnalysis
    ? importAnalysis.words.length - (duplicatePolicy === "skip" ? importAnalysis.duplicateCount : 0)
    : 0;

  useEffect(() => {
    window.sessionStorage.setItem("toefl-library:v2:navigator-width", String(navigatorWidth));
    window.sessionStorage.setItem("toefl-library:v2:inspector-width", String(inspectorWidth));
    window.sessionStorage.setItem("toefl-library:v2:term-column-width", String(termColumnWidth));
    window.sessionStorage.setItem("toefl-library:navigator-collapsed", String(navigatorCollapsed));
    window.sessionStorage.setItem("toefl-library:inspector-collapsed", String(inspectorCollapsed));
  }, [inspectorCollapsed, inspectorWidth, navigatorCollapsed, navigatorWidth, termColumnWidth]);

  useEffect(() => {
    if (!initialWordId || appliedInitialWordRef.current === initialWordId) {
      return;
    }

    const list = findListForWord(initialWordId, snapshot.wordLists);
    if (list) {
      appliedInitialWordRef.current = initialWordId;
      setSelectedListId(list.id);
      setSelectedWordId(initialWordId);
      const index = list.words.findIndex((word) => word.id === initialWordId);
      setVisibleCount(
        Math.max(WORD_BATCH_SIZE, Math.ceil((index + 1) / WORD_BATCH_SIZE) * WORD_BATCH_SIZE),
      );
    }
  }, [initialWordId, snapshot.wordLists]);

  useEffect(() => {
    if (selectedListId && snapshot.wordLists.some((list) => list.id === selectedListId)) {
      return;
    }

    setSelectedListId(snapshot.wordLists[0]?.id ?? "");
  }, [selectedListId, snapshot.wordLists]);

  useEffect(() => {
    if (filteredWords.some((word) => word.id === selectedWordId)) {
      return;
    }
    setSelectedWordId(displayedWords[0]?.id ?? "");
  }, [displayedWords, filteredWords, selectedWordId]);

  useEffect(() => {
    const pendingId = pendingRowFocusRef.current;
    if (!pendingId || !displayedWords.some((word) => word.id === pendingId)) {
      return;
    }

    pendingRowFocusRef.current = null;
    window.requestAnimationFrame(() => {
      rowButtonRefs.current.get(pendingId)?.focus({ preventScroll: true });
      rowButtonRefs.current.get(pendingId)?.scrollIntoView({ block: "nearest" });
    });
  }, [displayedWords]);

  useEffect(() => {
    const firstNewWordId = pendingLoadMoreFocusRef.current;
    if (!firstNewWordId || !displayedWords.some((word) => word.id === firstNewWordId)) {
      return;
    }

    pendingLoadMoreFocusRef.current = null;
    window.requestAnimationFrame(() => {
      const loadMoreButton = loadMoreButtonRef.current;
      if (loadMoreButton?.isConnected) {
        loadMoreButton.focus();
        return;
      }

      rowButtonRefs.current.get(firstNewWordId)?.focus({ preventScroll: true });
      rowButtonRefs.current.get(firstNewWordId)?.scrollIntoView({ block: "nearest" });
    });
  }, [displayedWords]);

  const announce = (message: string) => {
    setLibraryStatus(message);
    onNotice(message);
  };

  const selectList = (list: WordList) => {
    setSelectedListId(list.id);
    setSelectedWordId(list.words[0]?.id ?? "");
    setSearch("");
    setVisibleCount(WORD_BATCH_SIZE);
    setNavigatorDrawerOpen(false);
  };

  const selectWord = (wordId: string, openDetails = true) => {
    setSelectedWordId(wordId);
    if (openDetails && compactInspector) {
      setInspectorDrawerOpen(true);
    }
  };

  const clearSearchAndFocus = () => {
    setSearch("");
    setVisibleCount(WORD_BATCH_SIZE);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const loadMoreWords = () => {
    const firstNewWord = filteredWords[displayedWords.length];
    const nextVisibleCount = Math.min(visibleCount + WORD_BATCH_SIZE, filteredWords.length);
    pendingLoadMoreFocusRef.current = firstNewWord?.id ?? null;
    if (nextVisibleCount === filteredWords.length && firstNewWord) {
      setSelectedWordId(firstNewWord.id);
    }
    setVisibleCount(nextVisibleCount);
  };

  const toggleList = (list: WordList, enabled: boolean) => {
    try {
      vocabularyRepository.setListEnabled(list.id, enabled);
      announce(`${list.title} is ${enabled ? "included in" : "excluded from"} review sessions.`);
    } catch (error) {
      announce(`Could not update ${list.title}. ${errorMessage(error)}`);
    }
  };

  const markSelectedLearned = () => {
    if (!selectedWord) {
      return;
    }
    const current = snapshot.progress[selectedWord.id] ?? createEmptyProgress(selectedWord.id);
    vocabularyRepository.setProgress(
      selectedWord.id,
      {
        ...current,
        timesSeen: Math.max(5, current.timesSeen),
        timesKnown: Math.max(5, current.timesKnown),
        consecutiveCorrect: Math.max(5, current.consecutiveCorrect),
        memoryDifficulty: Math.min(3, current.memoryDifficulty),
        lastReviewedAt: new Date().toISOString(),
        dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
      createReviewEvent({ word: selectedWord, list: selectedList }, "known", 0),
    );
    announce(`${selectedWord.term} was marked as learned.`);
  };

  const markSelectedDifficult = () => {
    if (!selectedWord) {
      return;
    }
    const current = snapshot.progress[selectedWord.id] ?? createEmptyProgress(selectedWord.id);
    vocabularyRepository.setProgress(
      selectedWord.id,
      {
        ...current,
        timesSeen: Math.max(1, current.timesSeen),
        timesSkipped: current.timesSkipped + 1,
        lapses: Math.max(2, current.lapses + 1),
        memoryDifficulty: Math.max(8, current.memoryDifficulty),
        lastReviewedAt: new Date().toISOString(),
        dueAt: new Date().toISOString(),
      },
      createReviewEvent({ word: selectedWord, list: selectedList }, "skipped", 0),
    );
    announce(`${selectedWord.term} was added to difficult words.`);
  };

  const updateDraft = (field: keyof PersonalWordDraft, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (addError) {
      setAddError("");
    }
  };

  const saveWord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addBusy) {
      return;
    }

    if (!draft.term.trim()) {
      setAddError("Enter a word before adding it.");
      addTermRef.current?.focus();
      return;
    }

    setAddBusy(true);
    setAddError("");
    try {
      const editableListId = selectedList.isBuiltIn
        ? vocabularyRepository.personalListId
        : selectedList.id;
      if (editingWordId) {
        vocabularyRepository.updateEditableWord(editableListId, editingWordId, draft);
        setSelectedWordId(editingWordId);
        announce(`${draft.term.trim()} was updated.`);
      } else {
        const word = await vocabularyRepository.addWordToList(draft, editableListId);
        setSelectedListId(editableListId);
        setSelectedWordId(word.id);
        announce(
          `${word.term} was added to ${editableListId === vocabularyRepository.personalListId ? "Personal words" : selectedList.title}.`,
        );
      }
      setDraft(EMPTY_DRAFT);
      setEditingWordId(null);
      setSearch("");
      setVisibleCount(WORD_BATCH_SIZE);
      setAddOpen(false);
    } catch (error) {
      setAddError(errorMessage(error));
      window.requestAnimationFrame(() => addTermRef.current?.focus());
    } finally {
      setAddBusy(false);
    }
  };

  const openAddWord = (trigger: HTMLButtonElement) => {
    addTriggerRef.current = trigger;
    setEditingWordId(null);
    setDraft(EMPTY_DRAFT);
    setAddError("");
    setAddOpen(true);
  };

  const openEditWord = () => {
    if (!selectedWord || !selectedCanEdit) {
      return;
    }
    setEditingWordId(selectedWord.id);
    setDraft({
      term: selectedWord.term,
      partOfSpeech: selectedWord.partOfSpeech ?? "",
      pronunciation: selectedWord.pronunciation ?? "",
      shortMeaning: selectedWord.shortMeaning ?? "",
      notes: selectedWord.notes ?? "",
    });
    setAddError("");
    setAddOpen(true);
  };

  const createWordlist = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const list = vocabularyRepository.createWordList(newListTitle);
      setSelectedListId(list.id);
      setSelectedWordId("");
      setNewListTitle("");
      setNewListError("");
      setNewListOpen(false);
      announce(`${list.title} was created.`);
    } catch (error) {
      setNewListError(errorMessage(error));
    }
  };

  const startPanelResize = (
    side: "navigator" | "inspector",
    event: React.PointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "navigator" ? navigatorWidth : inspectorWidth;
    const min = side === "navigator" ? NAVIGATOR_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
    const max = side === "navigator" ? NAVIGATOR_MAX_WIDTH : INSPECTOR_MAX_WIDTH;
    const direction = side === "navigator" ? 1 : -1;
    const move = (moveEvent: PointerEvent) => {
      const width = Math.min(
        max,
        Math.max(min, startWidth + (moveEvent.clientX - startX) * direction),
      );
      if (side === "navigator") {
        setNavigatorWidth(width);
      } else {
        setInspectorWidth(width);
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const resizePanelWithKeyboard = (
    side: "navigator" | "inspector",
    event: React.KeyboardEvent<HTMLElement>,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta = (event.key === "ArrowRight" ? 8 : -8) * (side === "navigator" ? 1 : -1);
    if (side === "navigator") {
      setNavigatorWidth((width) =>
        Math.min(NAVIGATOR_MAX_WIDTH, Math.max(NAVIGATOR_MIN_WIDTH, width + delta)),
      );
    } else {
      setInspectorWidth((width) =>
        Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, width + delta)),
      );
    }
  };

  const startColumnResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = termColumnWidth;
    const move = (moveEvent: PointerEvent) =>
      setTermColumnWidth(Math.min(280, Math.max(130, startWidth + moveEvent.clientX - startX)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const pasteIntoDraft = async () => {
    if (addBusy) {
      return;
    }

    setAddError("");
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard access is not available on this device.");
      }

      const value = (await navigator.clipboard.readText()).trim();
      if (!isClipboardWord(value)) {
        throw new Error("Copy one word containing only letters, an apostrophe, or a hyphen.");
      }

      setDraft((current) => ({ ...current, term: value }));
      window.requestAnimationFrame(() => addTermRef.current?.focus());
    } catch (error) {
      setAddError(errorMessage(error));
    }
  };

  const resetImport = () => {
    setImportPhase("idle");
    setImportFileName("");
    setImportValue(undefined);
    setImportError("");
    setDuplicatePolicy("skip");
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  };

  const changeImportOpen = (open: boolean) => {
    setImportOpen(open);
    if (!open) {
      resetImport();
    }
  };

  const readImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || importPhase !== "idle") {
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

    setImportPhase("reading");
    try {
      const text = (await file.text()).replace(/^\uFEFF/u, "");
      setImportValue(JSON.parse(text) as unknown);
    } catch (error) {
      setImportError(
        error instanceof SyntaxError
          ? "The file is not valid JSON. Fix its syntax and choose it again."
          : `The file could not be read. ${errorMessage(error)}`,
      );
    } finally {
      setImportPhase("idle");
    }
  };

  const importWordList = () => {
    if (
      importValue === undefined ||
      !importAnalysis ||
      importAnalysis.blockingIssues.length ||
      importableCount < 1 ||
      importPhase !== "idle"
    ) {
      return;
    }

    setImportPhase("saving");
    setImportError("");
    try {
      const result = vocabularyRepository.importWordList(importValue, duplicatePolicy === "skip");
      setSelectedListId(result.list.id);
      setSelectedWordId(result.list.words[0]?.id ?? "");
      setSearch("");
      setVisibleCount(WORD_BATCH_SIZE);

      const duplicateMessage = result.skippedDuplicates
        ? ` ${pluralize(result.skippedDuplicates, "duplicate")} skipped.`
        : result.warnings.length
          ? ` ${pluralize(result.warnings.length, "duplicate")} kept.`
          : "";
      const message = `${result.list.title} was imported with ${pluralize(result.list.words.length, "word")}.${duplicateMessage}`;
      setImportOpen(false);
      resetImport();
      announce(message);
    } catch (error) {
      setImportError(`Import failed. ${errorMessage(error)}`);
      setImportPhase("idle");
    }
  };

  const exportSelectedList = () => {
    if (!selectedList) {
      return;
    }

    try {
      const contents = vocabularyRepository.exportWordList(selectedList.id);
      const blob = new Blob([contents], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedList.id.replace(/[^a-z0-9_-]+/gi, "-")}.wordlist.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      announce(`${selectedList.title} was exported.`);
    } catch (error) {
      announce(`Export failed. ${errorMessage(error)}`);
    }
  };

  const requestDeleteWord = () => {
    if (!selectedWord || selectedList.isBuiltIn) {
      return;
    }
    setConfirmationError("");
    setConfirmation({
      kind: "word",
      id: selectedWord.id,
      label: selectedWord.term,
    });
  };

  const requestDeleteList = () => {
    if (
      !selectedList ||
      selectedList.isBuiltIn ||
      selectedList.id === vocabularyRepository.personalListId
    ) {
      return;
    }
    setConfirmationError("");
    setConfirmation({
      kind: "list",
      id: selectedList.id,
      label: selectedList.title,
      wordCount: selectedList.words.length,
    });
  };

  const confirmDeletion = () => {
    if (!confirmation) {
      return;
    }

    setConfirmationError("");
    try {
      if (confirmation.kind === "word") {
        vocabularyRepository.deleteEditableWord(selectedList.id, confirmation.id);
        setSelectedWordId("");
        announce(`${confirmation.label} was deleted. Its review history was kept.`);
      } else {
        vocabularyRepository.deleteImportedList(confirmation.id);
        const fallback = snapshot.wordLists.find((list) => list.id !== confirmation.id);
        setSelectedListId(fallback?.id ?? "");
        setSelectedWordId(fallback?.words[0]?.id ?? "");
        setSearch("");
        announce(`${confirmation.label} was deleted. Its review history was kept.`);
      }
      setConfirmation(null);
    } catch (error) {
      setConfirmationError(errorMessage(error));
    }
  };

  const focusWordAt = (index: number) => {
    const boundedIndex = Math.max(0, Math.min(index, filteredWords.length - 1));
    const word = filteredWords[boundedIndex];
    if (!word) {
      return;
    }

    pendingRowFocusRef.current = word.id;
    setVisibleCount((current) => Math.max(current, boundedIndex + 1));
    setSelectedWordId(word.id);
  };

  const handleWordKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        nextIndex = index + 1;
        break;
      case "ArrowUp":
        nextIndex = index - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = filteredWords.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    focusWordAt(nextIndex);
  };

  if (!selectedList) {
    return (
      <section className="tc-library-empty" aria-labelledby="library-empty">
        <h2 id="library-empty">Vocabulary library</h2>
        <p>No wordlists are available yet.</p>
      </section>
    );
  }

  const selectedIsImported =
    !selectedList.isBuiltIn && selectedList.id !== vocabularyRepository.personalListId;
  const dueLabel = !selectedProgress
    ? "Not studied yet"
    : Date.parse(selectedProgress.dueAt) <= Date.now()
      ? "Due now"
      : `Due ${formatRecentDate(selectedProgress.dueAt)}`;
  const resultSummary = search.trim()
    ? `${pluralize(filteredWords.length, "match")} in ${getLibraryDisplayTitle(selectedList)}`
    : `${pluralize(filteredWords.length, "word")} in ${getLibraryDisplayTitle(selectedList)}`;

  return (
    <>
      <section className="tc-library" aria-labelledby="tc-library-heading">
        <header className="tc-library__commandbar">
          <div className="tc-library__title">
            <p>Vocabulary</p>
            <div>
              <h2 id="tc-library-heading">Library</h2>
              <span>{pluralize(visibleWordLists.length, "library", "libraries")}</span>
            </div>
          </div>
          <div className="tc-library__command-actions">
            <button
              type="button"
              className="tc-library__icon-button tc-library__panel-toggle"
              aria-label={
                compactNavigator || navigatorCollapsed ? "Show wordlists" : "Hide wordlists"
              }
              title={compactNavigator || navigatorCollapsed ? "Show wordlists" : "Hide wordlists"}
              onClick={() =>
                compactNavigator
                  ? setNavigatorDrawerOpen(true)
                  : setNavigatorCollapsed((value) => !value)
              }
            >
              <SidebarSimpleIcon size={19} aria-hidden />
            </button>
            <button
              type="button"
              className="tc-library__button"
              onClick={(event) => {
                importTriggerRef.current = event.currentTarget;
                setImportOpen(true);
              }}
            >
              <DoodleIcon name="upload" size={17} />
              Import
            </button>
            <button type="button" className="tc-library__button" onClick={exportSelectedList}>
              <DoodleIcon name="download" size={17} />
              Export
            </button>
            <button
              type="button"
              className="tc-library__button tc-library__button--primary"
              onClick={(event) => openAddWord(event.currentTarget)}
              ref={primaryAddButtonRef}
            >
              <DoodleIcon name="folder-add" size={17} />
              Add word
            </button>
            <button
              type="button"
              className="tc-library__button tc-library__settings-button"
              onClick={onOpenSettings}
            >
              <DoodleIcon name="setting" size={17} />
              Reminders
            </button>
            <button
              type="button"
              className="tc-library__icon-button tc-library__panel-toggle"
              data-side="right"
              aria-label={
                compactInspector || inspectorCollapsed ? "Show word details" : "Hide word details"
              }
              title={
                compactInspector || inspectorCollapsed ? "Show word details" : "Hide word details"
              }
              disabled={!selectedWord}
              onClick={() =>
                compactInspector
                  ? setInspectorDrawerOpen(true)
                  : setInspectorCollapsed((value) => !value)
              }
            >
              <SidebarSimpleIcon size={19} aria-hidden />
            </button>
            {selectedIsImported ? (
              <button
                type="button"
                className="tc-library__icon-button tc-library__icon-button--danger"
                onClick={(event) => {
                  confirmationTriggerRef.current = event.currentTarget;
                  requestDeleteList();
                }}
                aria-label={`Delete ${selectedList.title}`}
                title="Delete imported wordlist"
              >
                <TrashIcon size={18} aria-hidden />
              </button>
            ) : null}
          </div>
        </header>

        {libraryStatus ? (
          <p className="tc-library__status">
            <CheckIcon size={16} weight="bold" aria-hidden />
            {libraryStatus}
          </p>
        ) : null}

        <div
          className="tc-library__workspace"
          data-navigator-collapsed={navigatorCollapsed && !compactNavigator}
          data-inspector-collapsed={inspectorCollapsed && !compactInspector}
          style={
            {
              "--tc-library-navigator-width": `${navigatorWidth}px`,
              "--tc-library-inspector-width": `${inspectorWidth}px`,
            } as CSSProperties
          }
        >
          {!compactNavigator && !navigatorCollapsed ? (
            <>
              <WordlistPanel
                lists={visibleWordLists}
                selectedListId={selectedList.id}
                onSelect={selectList}
                onToggleReview={toggleList}
                onCreateList={() => setNewListOpen(true)}
              />
              <hr
                className="tc-library__resize-handle"
                aria-label="Resize wordlists panel"
                aria-orientation="vertical"
                aria-valuemin={NAVIGATOR_MIN_WIDTH}
                aria-valuemax={NAVIGATOR_MAX_WIDTH}
                aria-valuenow={Math.round(navigatorWidth)}
                tabIndex={0}
                onPointerDown={(event) => startPanelResize("navigator", event)}
                onKeyDown={(event) => resizePanelWithKeyboard("navigator", event)}
              />
            </>
          ) : null}

          <section className="tc-library__main" aria-labelledby="tc-library-selected-list">
            <header className="tc-library__list-header">
              <div className="tc-library__list-heading">
                <div className="tc-library__list-title-row">
                  <h3 id="tc-library-selected-list" title={selectedList.title}>
                    {getLibraryDisplayTitle(selectedList)}
                  </h3>
                  <div className="tc-library__list-stats">
                    <span>{pluralize(selectedList.words.length, "word")}</span>
                    <span>{selectedListDueCount.toLocaleString()} due</span>
                    <span>{selectedListMasteredCount.toLocaleString()} mastered</span>
                  </div>
                </div>
                <p>{selectedList.source ?? "Local wordlist"}</p>
              </div>

              <div className="tc-library__filterbar">
                <label className="tc-library__search" htmlFor={searchId}>
                  <span className="tc-library__field-label">Search</span>
                  <span className="tc-library__search-field">
                    <MagnifyingGlassIcon size={17} aria-hidden />
                    <input
                      ref={searchInputRef}
                      id={searchId}
                      type="search"
                      name="vocabulary-search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        setVisibleCount(WORD_BATCH_SIZE);
                      }}
                      placeholder="Search this list"
                    />
                  </span>
                </label>
                <label className="tc-library__sort" htmlFor={sortId}>
                  <span className="tc-library__field-label">Sort</span>
                  <select
                    id={sortId}
                    value={sort}
                    onChange={(event) => {
                      setSort(event.currentTarget.value as LibrarySort);
                      setVisibleCount(WORD_BATCH_SIZE);
                    }}
                  >
                    <option value="source">Source order</option>
                    <option value="alphabetical">A–Z</option>
                    <option value="partOfSpeech">Part of speech</option>
                    <option value="recent">Recently reviewed</option>
                  </select>
                </label>
              </div>
            </header>

            <div className="tc-library__resultbar">
              <p id="tc-library-keyboard-hint" role="status">
                {resultSummary}
                {displayedWords.length < filteredWords.length
                  ? ` · showing ${displayedWords.length.toLocaleString()}`
                  : ""}
              </p>
              <span>Use ↑ ↓ Home End to move between rows</span>
            </div>

            {displayedWords.length ? (
              <>
                <div className="tc-library__table-scroller">
                  <table className="tc-library__table">
                    <caption className="tc-library__sr-only">
                      Words in {selectedList.title}. Use the arrow keys, Home, and End after
                      focusing a term.
                    </caption>
                    <colgroup>
                      <col style={{ width: `${termColumnWidth}px` }} />
                      {showPartOfSpeech ? <col className="tc-library__type-col" /> : null}
                      <col />
                      <col className="tc-library__status-col" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="tc-library__term-heading"
                          aria-sort={sort === "alphabetical" ? "ascending" : "none"}
                        >
                          Term
                          <hr
                            className="tc-library__column-resizer"
                            aria-label="Resize term column"
                            aria-orientation="vertical"
                            aria-valuemin={130}
                            aria-valuemax={280}
                            aria-valuenow={Math.round(termColumnWidth)}
                            tabIndex={0}
                            onPointerDown={startColumnResize}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                                event.preventDefault();
                                setTermColumnWidth((width) =>
                                  Math.min(
                                    280,
                                    Math.max(130, width + (event.key === "ArrowRight" ? 8 : -8)),
                                  ),
                                );
                              }
                            }}
                          />
                        </th>
                        {showPartOfSpeech ? (
                          <th
                            scope="col"
                            className="tc-library__optional-column"
                            aria-sort={sort === "partOfSpeech" ? "ascending" : "none"}
                          >
                            Type
                          </th>
                        ) : null}
                        <th scope="col">Meaning</th>
                        <th
                          scope="col"
                          className="tc-library__review-column"
                          aria-sort={sort === "recent" ? "descending" : "none"}
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedWords.map((word, index) => {
                        const progress = snapshot.progress[word.id];
                        const isSelected = word.id === selectedWord?.id;
                        return (
                          <tr
                            className="tc-library__table-row"
                            data-selected={isSelected}
                            key={word.id}
                            onClick={() => selectWord(word.id)}
                          >
                            <th scope="row">
                              <button
                                ref={(node) => {
                                  if (node) {
                                    rowButtonRefs.current.set(word.id, node);
                                  } else {
                                    rowButtonRefs.current.delete(word.id);
                                  }
                                }}
                                type="button"
                                className="tc-library__word-button"
                                onClick={() => selectWord(word.id)}
                                onKeyDown={(event) => handleWordKeyDown(event, index)}
                                aria-pressed={isSelected}
                                aria-describedby="tc-library-keyboard-hint"
                                tabIndex={isSelected ? 0 : -1}
                              >
                                {word.term}
                              </button>
                            </th>
                            {showPartOfSpeech ? (
                              <td className="tc-library__optional-column">
                                {word.partOfSpeech || "—"}
                              </td>
                            ) : null}
                            <td
                              className="tc-library__meaning-cell"
                              dir={isPersianText(word.shortMeaning) ? "rtl" : "ltr"}
                              data-rtl={isPersianText(word.shortMeaning)}
                            >
                              {word.shortMeaning || (
                                <span className="tc-library__muted-value">No definition</span>
                              )}
                            </td>
                            <td className="tc-library__review-column">
                              <ReviewStatusBadge progress={progress} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {remainingWords > 0 ? (
                  <div className="tc-library__load-more">
                    <button
                      ref={loadMoreButtonRef}
                      type="button"
                      className="tc-library__button"
                      onClick={loadMoreWords}
                    >
                      Load {Math.min(WORD_BATCH_SIZE, remainingWords)} more
                    </button>
                    <span>{pluralize(remainingWords, "word")} remaining</span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="tc-library__empty-state">
                {search.trim() ? (
                  <>
                    <MagnifyingGlassIcon size={24} aria-hidden />
                    <h3>No words match “{search.trim()}”</h3>
                    <p>Try a shorter term or search another wordlist.</p>
                    <button
                      type="button"
                      className="tc-library__button"
                      onClick={clearSearchAndFocus}
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <PlusIcon size={24} aria-hidden />
                    <h3>This wordlist is empty</h3>
                    <p>Add a personal word or import a JSON wordlist.</p>
                    <button
                      type="button"
                      className="tc-library__button tc-library__button--primary"
                      onClick={(event) => openAddWord(event.currentTarget)}
                    >
                      Add a word
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          {!compactInspector && !inspectorCollapsed ? (
            <>
              <hr
                className="tc-library__resize-handle tc-library__resize-handle--inspector"
                aria-label="Resize word details panel"
                aria-orientation="vertical"
                aria-valuemin={INSPECTOR_MIN_WIDTH}
                aria-valuemax={INSPECTOR_MAX_WIDTH}
                aria-valuenow={Math.round(inspectorWidth)}
                tabIndex={0}
                onPointerDown={(event) => startPanelResize("inspector", event)}
                onKeyDown={(event) => resizePanelWithKeyboard("inspector", event)}
              />
              <WordDetailsPanel
                word={selectedWord}
                progress={selectedProgress}
                canEdit={selectedCanEdit}
                scheduleLabel={dueLabel}
                onSpeak={() => {
                  if (selectedWord?.pronunciation) {
                    speakVocabulary(selectedWord.term, snapshot.settings);
                  }
                }}
                onEdit={openEditWord}
                onMarkLearned={markSelectedLearned}
                onMarkDifficult={markSelectedDifficult}
                onDelete={() => {
                  confirmationTriggerRef.current =
                    document.activeElement instanceof HTMLButtonElement
                      ? document.activeElement
                      : null;
                  requestDeleteWord();
                }}
              />
            </>
          ) : null}
        </div>
      </section>

      <Dialog.Root open={navigatorDrawerOpen} onOpenChange={setNavigatorDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="tc-library-drawer__overlay" />
          <Dialog.Content className="tc-library-drawer tc-library-drawer--navigator">
            <Dialog.Title className="tc-library__sr-only">Wordlists</Dialog.Title>
            <Dialog.Description className="tc-library__sr-only">
              Choose and manage vocabulary wordlists.
            </Dialog.Description>
            <WordlistPanel
              lists={visibleWordLists}
              selectedListId={selectedList.id}
              onSelect={selectList}
              onToggleReview={toggleList}
              onCreateList={() => setNewListOpen(true)}
              onClose={() => setNavigatorDrawerOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={inspectorDrawerOpen} onOpenChange={setInspectorDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="tc-library-drawer__overlay" />
          <Dialog.Content className="tc-library-drawer tc-library-drawer--inspector">
            <Dialog.Title className="tc-library__sr-only">Word details</Dialog.Title>
            <Dialog.Description className="tc-library__sr-only">
              Review details and actions for the selected vocabulary word.
            </Dialog.Description>
            <WordDetailsPanel
              word={selectedWord}
              progress={selectedProgress}
              canEdit={selectedCanEdit}
              scheduleLabel={dueLabel}
              onSpeak={() => {
                if (selectedWord?.pronunciation) {
                  speakVocabulary(selectedWord.term, snapshot.settings);
                }
              }}
              onEdit={openEditWord}
              onMarkLearned={markSelectedLearned}
              onMarkDifficult={markSelectedDifficult}
              onDelete={() => {
                confirmationTriggerRef.current =
                  document.activeElement instanceof HTMLButtonElement
                    ? document.activeElement
                    : null;
                requestDeleteWord();
              }}
              onClose={() => setInspectorDrawerOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={newListOpen}
        onOpenChange={(open) => {
          setNewListOpen(open);
          if (!open) {
            setNewListTitle("");
            setNewListError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="tc-library-dialog__overlay" />
          <Dialog.Content
            className="tc-library-dialog tc-library-dialog--confirm"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => newListTitleRef.current?.focus());
            }}
          >
            <header className="tc-library-dialog__header">
              <div>
                <Dialog.Title>Create a wordlist</Dialog.Title>
                <Dialog.Description>
                  Add an empty list, then fill it with your own vocabulary.
                </Dialog.Description>
              </div>
              <Dialog.Close className="tc-library-dialog__close" aria-label="Close create wordlist">
                <XIcon size={19} aria-hidden />
              </Dialog.Close>
            </header>
            <form className="tc-library-dialog__form" onSubmit={createWordlist}>
              <label htmlFor={newListTitleId}>
                <span>Wordlist name</span>
                <input
                  ref={newListTitleRef}
                  id={newListTitleId}
                  value={newListTitle}
                  onChange={(event) => setNewListTitle(event.currentTarget.value)}
                  maxLength={80}
                  required
                  aria-invalid={Boolean(newListError)}
                />
              </label>
              {newListError ? (
                <p className="tc-library-dialog__error" role="alert">
                  <WarningCircleIcon size={18} weight="fill" aria-hidden />
                  {newListError}
                </p>
              ) : null}
              <footer className="tc-library-dialog__footer">
                <Dialog.Close type="button" className="tc-library__button">
                  Cancel
                </Dialog.Close>
                <button
                  type="submit"
                  className="tc-library__button tc-library__button--primary"
                  disabled={!newListTitle.trim()}
                >
                  <PlusIcon size={18} weight="bold" aria-hidden />
                  Create wordlist
                </button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setEditingWordId(null);
            setDraft(EMPTY_DRAFT);
            setAddError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="tc-library-dialog__overlay" />
          <Dialog.Content
            className="tc-library-dialog tc-library-dialog--add"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => addTermRef.current?.focus());
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => {
                const target = addTriggerRef.current?.isConnected
                  ? addTriggerRef.current
                  : primaryAddButtonRef.current;
                target?.focus();
              });
            }}
          >
            <header className="tc-library-dialog__header">
              <div>
                <Dialog.Title>{editingWordId ? "Edit word" : "Add a word"}</Dialog.Title>
                <Dialog.Description>
                  {editingWordId
                    ? `Update this word in ${selectedList.title}.`
                    : `Save this word in ${
                        selectedList.isBuiltIn ? "Personal words" : selectedList.title
                      }. Optional details make later review easier.`}
                </Dialog.Description>
              </div>
              <Dialog.Close className="tc-library-dialog__close" aria-label="Close word dialog">
                <XIcon size={19} aria-hidden />
              </Dialog.Close>
            </header>

            {snapshot.settings.clipboardQuickAddEnabled ? (
              <button
                type="button"
                className="tc-library-dialog__paste"
                onClick={() => void pasteIntoDraft()}
                disabled={addBusy}
              >
                <ClipboardTextIcon size={18} aria-hidden />
                Paste a copied word
              </button>
            ) : null}

            <form className="tc-library-dialog__form" onSubmit={(event) => void saveWord(event)}>
              <label htmlFor={addTermId}>
                <span>
                  Word <strong aria-hidden>*</strong>
                </span>
                <input
                  ref={addTermRef}
                  id={addTermId}
                  name="term"
                  value={draft.term}
                  onChange={(event) => updateDraft("term", event.currentTarget.value)}
                  required
                  maxLength={120}
                  autoComplete="off"
                  aria-invalid={Boolean(addError)}
                  aria-describedby={addError ? `${addTermId}-error` : undefined}
                />
              </label>
              <div className="tc-library-dialog__field-row">
                <label htmlFor={addPartOfSpeechId}>
                  <span>Part of speech</span>
                  <input
                    id={addPartOfSpeechId}
                    name="partOfSpeech"
                    value={draft.partOfSpeech}
                    onChange={(event) => updateDraft("partOfSpeech", event.currentTarget.value)}
                    maxLength={80}
                    placeholder="e.g. adjective"
                  />
                </label>
                <label htmlFor={addPronunciationId}>
                  <span>Pronunciation</span>
                  <input
                    id={addPronunciationId}
                    name="pronunciation"
                    value={draft.pronunciation}
                    onChange={(event) => updateDraft("pronunciation", event.currentTarget.value)}
                    maxLength={120}
                    placeholder="/example/"
                  />
                </label>
              </div>
              <label htmlFor={addMeaningId}>
                <span>Short definition</span>
                <textarea
                  id={addMeaningId}
                  name="shortMeaning"
                  value={draft.shortMeaning}
                  onChange={(event) => updateDraft("shortMeaning", event.currentTarget.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Write a clear meaning in your own words."
                />
              </label>
              <label htmlFor={addNotesId}>
                <span>Personal notes</span>
                <textarea
                  id={addNotesId}
                  name="notes"
                  value={draft.notes}
                  onChange={(event) => updateDraft("notes", event.currentTarget.value)}
                  rows={2}
                  maxLength={1_000}
                  placeholder="Memory cue, context, or a sentence you use."
                />
              </label>

              {addError ? (
                <p className="tc-library-dialog__error" id={`${addTermId}-error`} role="alert">
                  <WarningCircleIcon size={18} weight="fill" aria-hidden />
                  {addError}
                </p>
              ) : null}

              <footer className="tc-library-dialog__footer">
                <Dialog.Close type="button" className="tc-library__button" disabled={addBusy}>
                  Cancel
                </Dialog.Close>
                <button
                  type="submit"
                  className="tc-library__button tc-library__button--primary"
                  disabled={addBusy || !draft.term.trim()}
                >
                  <PlusIcon size={18} weight="bold" aria-hidden />
                  {addBusy ? "Saving…" : editingWordId ? "Save changes" : "Add word"}
                </button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={importOpen} onOpenChange={changeImportOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="tc-library-dialog__overlay" />
          <Dialog.Content
            className="tc-library-dialog tc-library-dialog--import"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => importTriggerRef.current?.focus());
            }}
          >
            <header className="tc-library-dialog__header">
              <div>
                <Dialog.Title>Import a wordlist</Dialog.Title>
                <Dialog.Description>
                  Choose a file, review what will be added, then confirm the import.
                </Dialog.Description>
              </div>
              <Dialog.Close className="tc-library-dialog__close" aria-label="Close import dialog">
                <XIcon size={19} aria-hidden />
              </Dialog.Close>
            </header>

            <section
              className="tc-library-dialog__format"
              aria-labelledby="tc-library-import-format"
            >
              <div>
                <span className="tc-library-dialog__step">1</span>
                <div>
                  <h3 id="tc-library-import-format">Choose a JSON wordlist</h3>
                  <p>
                    Use a <strong>.json</strong> or <strong>.wordlist.json</strong> file created by
                    Export. Custom files need <code>schemaVersion</code>, <code>id</code>,{" "}
                    <code>title</code>, and a <code>words</code> array. Each word needs a{" "}
                    <code>term</code>; definitions and other fields are optional.
                  </p>
                </div>
              </div>
              <label className="tc-library-dialog__file-picker">
                <UploadSimpleIcon size={20} aria-hidden />
                <span>
                  <strong>
                    {importPhase === "reading"
                      ? "Reading file…"
                      : importFileName || "Choose JSON file"}
                  </strong>
                  <small>Maximum file size: 5 MB</small>
                </span>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,.wordlist.json,application/json"
                  onChange={(event) => void readImportFile(event)}
                  disabled={importPhase !== "idle"}
                />
              </label>
            </section>

            {importError ? (
              <p className="tc-library-dialog__error" role="alert">
                <WarningCircleIcon size={18} weight="fill" aria-hidden />
                {importError}
              </p>
            ) : null}

            {importAnalysis ? (
              <section
                className="tc-library-dialog__preview"
                aria-labelledby="tc-library-import-preview"
              >
                <div className="tc-library-dialog__preview-heading">
                  <span className="tc-library-dialog__step">2</span>
                  <div>
                    <h3 id="tc-library-import-preview">
                      Review {importAnalysis.title ?? "wordlist"}
                    </h3>
                    <p>
                      Parsed {pluralize(importAnalysis.rawWordCount, "entry")}. Nothing has been
                      imported yet.
                    </p>
                  </div>
                </div>

                <div className="tc-library-dialog__summary-grid">
                  <article>
                    <strong>{importAnalysis.words.length}</strong>
                    <span>valid</span>
                  </article>
                  <article data-warning={importAnalysis.malformedEntries.length > 0}>
                    <strong>{importAnalysis.malformedEntries.length}</strong>
                    <span>malformed</span>
                  </article>
                  <article data-warning={importAnalysis.duplicateCount > 0}>
                    <strong>{importAnalysis.duplicateCount}</strong>
                    <span>duplicates</span>
                  </article>
                  <article data-success={importableCount > 0}>
                    <strong>{Math.max(0, importableCount)}</strong>
                    <span>will import</span>
                  </article>
                </div>

                {importAnalysis.malformedEntries.length ? (
                  <p className="tc-library-dialog__warning">
                    <WarningCircleIcon size={17} aria-hidden />
                    Malformed{" "}
                    {pluralize(importAnalysis.malformedEntries.length, "entry", "entries")} at{" "}
                    {importAnalysis.malformedEntries
                      .slice(0, 6)
                      .map((entry) => `#${entry}`)
                      .join(", ")}
                    {importAnalysis.malformedEntries.length > 6 ? " and more" : ""}. These entries
                    have no usable term and will be ignored.
                  </p>
                ) : null}

                {importAnalysis.blockingIssues.length ? (
                  <div className="tc-library-dialog__blocking" role="alert">
                    <strong>Fix these issues before importing</strong>
                    <ul>
                      {importAnalysis.blockingIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {importAnalysis.words.length ? (
                  <div className="tc-library-dialog__preview-table-wrap">
                    <table className="tc-library-dialog__preview-table">
                      <caption className="tc-library__sr-only">
                        Preview of the first imported words
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Word</th>
                          <th scope="col">Type</th>
                          <th scope="col">Definition</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importAnalysis.words.slice(0, 8).map((word) => (
                          <tr key={`${word.index}-${word.term}`}>
                            <th scope="row">{word.term}</th>
                            <td>{word.partOfSpeech || "—"}</td>
                            <td dir="auto">{word.shortMeaning || "No definition"}</td>
                            <td>
                              {word.duplicate ? (
                                <span className="tc-library-dialog__duplicate">
                                  Duplicate in{" "}
                                  {word.duplicateSource === "file" ? "file" : "library"}
                                </span>
                              ) : (
                                <span className="tc-library-dialog__valid">Ready</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importAnalysis.words.length > 8 ? (
                      <p>And {pluralize(importAnalysis.words.length - 8, "more valid word")}.</p>
                    ) : null}
                  </div>
                ) : null}

                {importAnalysis.duplicateCount ? (
                  <fieldset className="tc-library-dialog__duplicate-policy">
                    <legend>How should duplicate terms be handled?</legend>
                    <label>
                      <input
                        type="radio"
                        name={importPolicyName}
                        value="skip"
                        checked={duplicatePolicy === "skip"}
                        onChange={() => setDuplicatePolicy("skip")}
                      />
                      <span>
                        <strong>Skip duplicates</strong>
                        <small>Recommended. Existing library words stay unchanged.</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={importPolicyName}
                        value="keep"
                        checked={duplicatePolicy === "keep"}
                        onChange={() => setDuplicatePolicy("keep")}
                      />
                      <span>
                        <strong>Keep duplicates</strong>
                        <small>Add every valid term, including repeated words.</small>
                      </span>
                    </label>
                  </fieldset>
                ) : null}

                {!importAnalysis.blockingIssues.length && importableCount < 1 ? (
                  <p className="tc-library-dialog__warning" role="alert">
                    <WarningCircleIcon size={17} aria-hidden />
                    Every valid term is already in your library. Choose “Keep duplicates” or use
                    another file.
                  </p>
                ) : null}
              </section>
            ) : null}

            <footer className="tc-library-dialog__footer">
              <Dialog.Close
                type="button"
                className="tc-library__button"
                disabled={importPhase === "saving"}
              >
                Cancel
              </Dialog.Close>
              <button
                type="button"
                className="tc-library__button tc-library__button--primary"
                onClick={importWordList}
                disabled={
                  importPhase !== "idle" ||
                  !importAnalysis ||
                  importAnalysis.blockingIssues.length > 0 ||
                  importableCount < 1
                }
              >
                <UploadSimpleIcon size={18} aria-hidden />
                {importPhase === "saving"
                  ? "Importing…"
                  : importAnalysis
                    ? `Import ${pluralize(Math.max(0, importableCount), "word")}`
                    : "Review a file first"}
              </button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
            setConfirmationError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="tc-library-dialog__overlay" />
          <Dialog.Content
            className="tc-library-dialog tc-library-dialog--confirm"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => {
                const target = confirmationTriggerRef.current?.isConnected
                  ? confirmationTriggerRef.current
                  : primaryAddButtonRef.current;
                target?.focus();
              });
            }}
          >
            <header className="tc-library-dialog__header">
              <div>
                <Dialog.Title>
                  Delete {confirmation?.kind === "list" ? "wordlist" : "word"}?
                </Dialog.Title>
                <Dialog.Description>
                  {confirmation?.kind === "list"
                    ? `“${confirmation.label}” and its ${pluralize(confirmation.wordCount, "word")} will be removed from the library.`
                    : `“${confirmation?.label ?? ""}” will be removed from Personal words.`}{" "}
                  Review history will be kept.
                </Dialog.Description>
              </div>
              <Dialog.Close className="tc-library-dialog__close" aria-label="Close confirmation">
                <XIcon size={19} aria-hidden />
              </Dialog.Close>
            </header>
            {confirmationError ? (
              <p className="tc-library-dialog__error" role="alert">
                <WarningCircleIcon size={18} weight="fill" aria-hidden />
                {confirmationError}
              </p>
            ) : null}
            <footer className="tc-library-dialog__footer">
              <Dialog.Close type="button" className="tc-library__button">
                Keep it
              </Dialog.Close>
              <button
                type="button"
                className="tc-library__button tc-library__button--danger"
                onClick={confirmDeletion}
              >
                <TrashIcon size={18} aria-hidden />
                Delete {confirmation?.kind === "list" ? "wordlist" : "word"}
              </button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
