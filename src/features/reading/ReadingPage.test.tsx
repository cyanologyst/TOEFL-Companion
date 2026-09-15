import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { studyRepository } from "../../services/studyRepository";
import { ReadingPage } from "./ReadingPage";
import { blanksOf, completeTheWords } from "./readingModel";

const [first, second] = completeTheWords.passages;

function renderPage(requestedPassageId?: string) {
  return render(
    <ReadingPage
      studyState={studyRepository.getSnapshot()}
      requestedPassageId={requestedPassageId}
      onChanged={vi.fn()}
    />,
  );
}

function wordBoxes(word: number) {
  const group = screen.getByRole("group", { name: new RegExp(`^Word ${word}:`) });
  return within(group).getAllByRole("textbox") as HTMLInputElement[];
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("Reading: Complete the Words", () => {
  it("lists every passage and opens on the first one not yet checked", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 2, name: first.title })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Passage list" });
    expect(within(list).getAllByRole("button")).toHaveLength(completeTheWords.passages.length);
    expect(wordBoxes(1)).toHaveLength(blanksOf(first)[0].missing.length);
  });

  it("opens the passage a link asks for", () => {
    renderPage(second.id);

    expect(screen.getByRole("heading", { level: 2, name: second.title })).toBeInTheDocument();
  });

  it("moves on to the next word as letters are typed and marks each letter on Check", async () => {
    const user = userEvent.setup();
    const [wordOne, wordTwo] = blanksOf(first);
    renderPage();

    await user.click(wordBoxes(1)[0]);
    await user.keyboard(wordOne.missing);
    expect(wordBoxes(2)[0]).toHaveFocus();

    // Deliberately wrong: no hidden part in this library starts with "q".
    expect(wordTwo.missing.startsWith("q")).toBe(false);
    await user.keyboard("q");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      `${wordOne.missing.length} of ${first.letterCount} letters right`,
    );
    expect(wordBoxes(2)[0]).toHaveAttribute("aria-invalid", "true");
    expect(wordBoxes(1)[0]).not.toHaveAttribute("aria-invalid");
    expect(studyRepository.getSnapshot().reading[first.id]?.lastCheck?.correctLetters).toBe(
      wordOne.missing.length,
    );
    expect(studyRepository.getSnapshot().activities[0]).toMatchObject({ kind: "reading" });
  });

  it("clears a letter with Backspace and steps back across a word", async () => {
    const user = userEvent.setup();
    const [wordOne] = blanksOf(first);
    renderPage();

    await user.click(wordBoxes(1)[0]);
    await user.keyboard(wordOne.missing);
    await user.keyboard("{Backspace}");

    const boxes = wordBoxes(1);
    expect(boxes[boxes.length - 1]).toHaveValue("");
    expect(boxes[boxes.length - 1]).toHaveFocus();
  });

  it("shows the answer key without letting the boxes be edited", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Show answers" }));

    const boxes = wordBoxes(1);
    expect(boxes.map((box) => box.value).join("")).toBe(blanksOf(first)[0].missing);
    expect(boxes[0]).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hide answers" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("filters the pool by what is left to do and by searching what is visible", async () => {
    const user = userEvent.setup();
    studyRepository.recordReadingCheck(first.id, first.title, [], {
      correctLetters: 0,
      totalLetters: first.letterCount,
      correctWords: 0,
      totalWords: first.blankCount,
    });
    renderPage();
    const list = screen.getByRole("list", { name: "Passage list" });
    const total = completeTheWords.passages.length;

    await user.click(screen.getByRole("button", { name: /^Done/ }));
    expect(within(list).getAllByRole("button")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /^To do/ }));
    expect(within(list).getAllByRole("button")).toHaveLength(total - 1);

    await user.click(screen.getByRole("button", { name: /^All/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search passages" }), "tiger");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });
});
