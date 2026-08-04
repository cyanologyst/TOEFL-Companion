import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { BookmarkSimpleIcon } from "@phosphor-icons/react/BookmarkSimple";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon } from "@phosphor-icons/react/X";
import * as Dialog from "@radix-ui/react-dialog";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { formatCount } from "../lib/format";
import { getQuestionKey } from "../lib/question";
import type { Topic } from "../types/toefl";

interface SearchDialogProps {
  open: boolean;
  topics: Topic[];
  savedKeys: Set<string>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onSelect: (topicId: number, questionIndex: number) => void;
}

interface SearchEntry {
  key: string;
  topicId: number;
  topicTitle: string;
  category: string;
  questionIndex: number;
  prompt: string;
  searchable: string;
}

const normalize = (value: string) => value.toLocaleLowerCase().trim();
const resultsId = (index: number) => `practice-search-result-${index}`;

export function SearchDialog({
  open,
  topics,
  savedKeys,
  returnFocusRef,
  onOpenChange,
  onSelect,
}: SearchDialogProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeResultId = resultsId(activeIndex);

  const entries = useMemo<SearchEntry[]>(
    () =>
      topics.flatMap((topic) =>
        topic.questions.map((question, questionIndex) => ({
          key: getQuestionKey(topic.id, questionIndex),
          topicId: topic.id,
          topicTitle: topic.title,
          category: topic.category,
          questionIndex,
          prompt: question.prompt,
          searchable: normalize(
            [
              topic.title,
              topic.category,
              question.prompt,
              question.plan,
              question.answer,
              question.answer2,
            ].join(" "),
          ),
        })),
      ),
    [topics],
  );

  const results = useMemo(() => {
    const normalized = normalize(deferredQuery);
    const savedOnly = normalized.startsWith("saved:");
    const terms = (savedOnly ? normalized.slice(6) : normalized).split(/\s+/).filter(Boolean);

    return entries
      .filter((entry) => !savedOnly || savedKeys.has(entry.key))
      .filter((entry) => terms.every((term) => entry.searchable.includes(term)))
      .slice(0, 24);
  }, [deferredQuery, entries, savedKeys]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (open && results.length > 0) {
      document.getElementById(activeResultId)?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [activeResultId, open, results.length]);

  const chooseResult = (index: number) => {
    const result = results[index];
    if (!result) {
      return;
    }
    onSelect(result.topicId, result.questionIndex);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="search-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => {
              if (returnFocusRef?.current?.isConnected) {
                returnFocusRef.current.focus();
              }
            });
          }}
        >
          <div className="search-dialog-header">
            <div>
              <Dialog.Title>Find a practice question</Dialog.Title>
              <Dialog.Description>
                Search all 120 prompts, topics, and model answers.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close search">
              <XIcon size={21} aria-hidden />
            </Dialog.Close>
          </div>

          <label className="search-field">
            <MagnifyingGlassIcon size={22} aria-hidden />
            <span className="sr-only">Search practice questions</span>
            <input
              ref={inputRef}
              type="search"
              name="practice-search"
              role="combobox"
              aria-label="Search practice questions"
              aria-expanded={open}
              aria-controls="practice-search-results"
              aria-activedescendant={results.length > 0 ? activeResultId : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  chooseResult(activeIndex);
                }
              }}
              placeholder="Try “technology”, “healthy routine”, or “saved:”"
              autoComplete="off"
            />
            <kbd>Esc</kbd>
          </label>

          <div className="search-meta" aria-live="polite">
            <span>{formatCount(results.length, "result")} shown</span>
            <span>↑↓ to move · Enter to open</span>
          </div>

          <div
            className="search-results"
            id="practice-search-results"
            role="listbox"
            aria-label="Practice question results"
          >
            {results.length > 0 ? (
              results.map((result, index) => (
                <button
                  type="button"
                  className="search-result"
                  data-active={index === activeIndex}
                  role="option"
                  aria-selected={index === activeIndex}
                  id={resultsId(index)}
                  tabIndex={-1}
                  key={result.key}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => chooseResult(index)}
                >
                  <span className="search-result-number">
                    {String(result.topicId).padStart(2, "0")}.{result.questionIndex + 1}
                  </span>
                  <span className="search-result-copy">
                    <span>
                      {result.topicTitle} · Q{result.questionIndex + 1}
                      {savedKeys.has(result.key) ? (
                        <BookmarkSimpleIcon size={14} weight="fill" aria-label="Saved" />
                      ) : null}
                    </span>
                    <strong>{result.prompt}</strong>
                  </span>
                  <ArrowRightIcon size={19} aria-hidden />
                </button>
              ))
            ) : (
              <div className="empty-state">
                <MagnifyingGlassIcon size={28} aria-hidden />
                <strong>No matching questions</strong>
                <span>Try fewer words or a broader topic.</span>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
