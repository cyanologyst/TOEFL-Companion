import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { vocabularyRepository } from "../services/vocabularyRepository";
import { VocabularyLibrary } from "./VocabularyLibrary";

const WORDS_PER_PAGE = 20;

function renderLibrary() {
  return render(
    <VocabularyLibrary
      snapshot={vocabularyRepository.getSnapshot()}
      onNotice={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
}

describe("VocabularyLibrary accessibility", () => {
  beforeEach(() => {
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("pages the table twenty words at a time", async () => {
    const user = userEvent.setup();
    const total = vocabularyRepository.getAllWords(vocabularyRepository.getSnapshot()).length;
    const pageCount = Math.ceil(total / WORDS_PER_PAGE);
    const { container } = renderLibrary();

    expect(container.querySelectorAll(".vlib__row")).toHaveLength(WORDS_PER_PAGE);
    expect(
      screen.getByText(`Showing 1–${WORDS_PER_PAGE} of ${total.toLocaleString()}`),
    ).toBeInTheDocument();
    expect(screen.getByText(`1 / ${pageCount}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    const firstTerm = container.querySelector<HTMLButtonElement>(".vlib__word")?.textContent;
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText(`2 / ${pageCount}`)).toBeInTheDocument();
    expect(container.querySelector<HTMLButtonElement>(".vlib__word")?.textContent).not.toBe(
      firstTerm,
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("uses one live region and returns focus after clearing an empty search", async () => {
    const user = userEvent.setup();
    const { container } = renderLibrary();

    expect(
      container.querySelectorAll('[role="status"], [aria-live="polite"], [aria-live="assertive"]'),
    ).toHaveLength(1);

    const search = screen.getByRole("searchbox", { name: "Search vocabulary" });
    await user.type(search, "not-a-word-in-this-library");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
    });
    expect(
      container.querySelectorAll('[role="status"], [aria-live="polite"], [aria-live="assertive"]'),
    ).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
  });

  it("walks the keyboard past the end of a page onto the next one", async () => {
    const user = userEvent.setup();
    const locations = vocabularyRepository.getAllWords(vocabularyRepository.getSnapshot());
    const pageCount = Math.ceil(locations.length / WORDS_PER_PAGE);
    const lastTerm = locations[locations.length - 1]?.word.term;
    const { container } = renderLibrary();

    const firstWord = container.querySelector<HTMLButtonElement>(".vlib__word");
    expect(firstWord).not.toBeNull();
    firstWord?.focus();
    await user.keyboard("{End}");

    await waitFor(() => {
      expect(screen.getByText(`${pageCount} / ${pageCount}`)).toBeInTheDocument();
    });
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.className).toContain("vlib__word");
    expect(focused?.textContent).toBe(lastTerm);
  });
});
