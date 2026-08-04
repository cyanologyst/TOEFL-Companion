import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { vocabularyRepository } from "../services/vocabularyRepository";
import { VocabularyLibrary } from "./VocabularyLibrary";

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

  it("starts with only the two supplied built-in libraries visible", () => {
    render(
      <VocabularyLibrary
        snapshot={vocabularyRepository.getSnapshot()}
        onNotice={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /TOEFL 550 Essential Words/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /NEO 1–10 Vocabulary/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Personal words/ })).not.toBeInTheDocument();
    expect(screen.getByText("2 libraries")).toBeInTheDocument();
  });

  it("uses one live region and returns focus after clearing a final search", async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    const { container } = render(
      <VocabularyLibrary
        snapshot={vocabularyRepository.getSnapshot()}
        onNotice={onNotice}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(
      container.querySelectorAll('[role="status"], [aria-live="polite"], [aria-live="assertive"]'),
    ).toHaveLength(1);

    const reviewToggle = screen.getAllByRole("switch", {
      name: /Review enabled for/,
    })[0];
    expect(reviewToggle).toBeDefined();
    await user.click(reviewToggle as HTMLInputElement);

    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(
      container.querySelectorAll('[role="status"], [aria-live="polite"], [aria-live="assertive"]'),
    ).toHaveLength(1);

    const search = screen.getByRole("searchbox", { name: "Search" });
    await user.type(search, "not-a-word-in-this-library");
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
  });

  it("keeps a useful focus target when the final Load More button disappears", async () => {
    const user = userEvent.setup();
    const snapshot = vocabularyRepository.getSnapshot();
    const firstList = snapshot.wordLists[0];
    const words = firstList.words.slice(0, 101);
    const focusedWord = words[100];
    const focusedSnapshot = {
      ...snapshot,
      wordLists: [{ ...firstList, words }],
    };
    const { container } = render(
      <VocabularyLibrary snapshot={focusedSnapshot} onNotice={vi.fn()} onOpenSettings={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Load 1 more" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Load 1 more" })).not.toBeInTheDocument();
    });
    const lastRowButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".tc-library__word-button"),
    ).at(-1);
    expect(lastRowButton).toHaveTextContent(focusedWord.term);
    expect(lastRowButton).toHaveFocus();
  });
});
