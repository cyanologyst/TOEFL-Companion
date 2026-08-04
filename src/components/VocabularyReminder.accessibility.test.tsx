import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WordEntry } from "../types/vocabulary";
import { VocabularyReminder } from "./VocabularyReminder";

const word: WordEntry = {
  id: "word-1",
  term: "articulate",
  partOfSpeech: "adjective",
  pronunciation: null,
  shortMeaning: "Able to express ideas clearly.",
  chapter: null,
  order: null,
  tags: [],
  exampleSentences: [],
  synonyms: [],
  antonyms: [],
  notes: null,
  difficulty: 2,
  enrichmentSource: null,
};

function reminderProps(overrides: Partial<React.ComponentProps<typeof VocabularyReminder>> = {}) {
  return {
    word,
    durationSeconds: 30,
    compact: false,
    onReview: vi.fn(),
    onSnooze: vi.fn(),
    onListen: vi.fn(),
    onDetails: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

describe("VocabularyReminder accessibility", () => {
  it("uses a polite reminder region without stealing study focus", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open reminder";
    document.body.append(trigger);
    trigger.focus();

    const { unmount } = render(<VocabularyReminder {...reminderProps()} />);

    expect(screen.getByRole("region", { name: "articulate" })).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("button", { name: "Listen to articulate" })).not.toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("keeps focus behavior explicit when Details navigates away", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Previous page action";
    document.body.append(trigger);
    trigger.focus();
    const onDetails = vi.fn();

    const { unmount } = render(<VocabularyReminder {...reminderProps({ onDetails })} />);
    const detailsButton = screen.getByRole("button", { name: "Details" });
    detailsButton.focus();
    fireEvent.click(detailsButton);
    await waitFor(() => expect(onDetails).toHaveBeenCalledOnce());

    unmount();
    expect(trigger).not.toHaveFocus();
    trigger.remove();
  });
});
