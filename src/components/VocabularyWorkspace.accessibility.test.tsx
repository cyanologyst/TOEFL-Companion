import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyProgress,
  createReviewEvent,
  vocabularyRepository,
} from "../services/vocabularyRepository";
import type { ReviewAction } from "../types/vocabulary";
import { VocabularyWorkspace } from "./VocabularyWorkspace";

function renderWorkspace(): void {
  render(<VocabularyWorkspace onOpenSettings={vi.fn()} onNotice={vi.fn()} />);
}

async function openReviewSetup(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  renderWorkspace();
  await user.click(screen.getByRole("tab", { name: "Review" }));
  return user;
}

async function startCustomSession(
  user: ReturnType<typeof userEvent.setup>,
  size: number,
): Promise<HTMLHeadingElement> {
  const sizeInput = screen.getByRole("spinbutton", { name: "Session size" });
  fireEvent.change(sizeInput, { target: { value: String(size) } });
  await user.click(screen.getByRole("button", { name: /^Start session$/ }));

  const heading = document.querySelector<HTMLHeadingElement>(".vocabulary-word-heading h2");
  expect(heading).not.toBeNull();
  await waitFor(() => expect(heading).toHaveFocus());
  return heading as HTMLHeadingElement;
}

beforeEach(() => {
  window.history.replaceState(null, "", "#view=vocabulary&section=overview");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VocabularyWorkspace accessibility", () => {
  it("links every tab to its labelled tabpanel", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    const overviewPanel = screen.getByRole("tabpanel", { name: "Overview" });
    expect(overviewTab).toHaveAttribute("aria-controls", overviewPanel.id);
    expect(overviewPanel).toHaveAttribute("aria-labelledby", overviewTab.id);

    const activityTab = screen.getByRole("tab", { name: "Activity" });
    await user.click(activityTab);
    const activityPanel = screen.getByRole("tabpanel", { name: "Activity" });
    expect(activityTab).toHaveAttribute("aria-controls", activityPanel.id);
    expect(activityPanel).toHaveAttribute("aria-labelledby", activityTab.id);
  });

  it("does not run review shortcuts from interactive or already-handled events", async () => {
    const user = await openReviewSetup();
    await startCustomSession(user, 1);

    const revealButton = screen.getByRole("button", { name: /Reveal meaning/ });
    fireEvent.keyDown(revealButton, { code: "Space", key: " " });
    expect(screen.getByRole("button", { name: /Reveal meaning/ })).toBeInTheDocument();

    const handledEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " ",
    });
    handledEvent.preventDefault();
    window.dispatchEvent(handledEvent);
    expect(screen.getByRole("button", { name: /Reveal meaning/ })).toBeInTheDocument();

    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(screen.queryByRole("button", { name: /Reveal meaning/ })).not.toBeInTheDocument();
  });

  it("moves focus to stable headings as an active review changes and ends", async () => {
    const user = await openReviewSetup();
    const firstHeading = await startCustomSession(user, 2);
    const firstTerm = firstHeading.textContent;

    await user.click(screen.getByRole("button", { name: /Reveal meaning/ }));
    await user.click(screen.getByRole("button", { name: /Later/ }));

    const nextHeading = document.querySelector<HTMLHeadingElement>(".vocabulary-word-heading h2");
    expect(nextHeading).not.toBeNull();
    await waitFor(() => {
      expect(nextHeading).toHaveFocus();
      expect(nextHeading).not.toHaveTextContent(firstTerm ?? "");
    });

    expect(screen.getByRole("progressbar", { name: "Review progress" })).toHaveAttribute(
      "aria-valuetext",
      "Reviewing word 2 of 2; 1 word completed",
    );

    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "End session" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /word.*about|No words available/i }),
      ).toHaveFocus(),
    );
  });

  it("focuses the completion and restarted setup headings", async () => {
    const user = await openReviewSetup();
    await startCustomSession(user, 1);

    await user.click(screen.getByRole("button", { name: /Reveal meaning/ }));
    await user.click(screen.getByRole("button", { name: /Known/ }));

    const completeHeading = await screen.findByRole("heading", {
      name: "You reviewed 1 word.",
    });
    await waitFor(() => expect(completeHeading).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Another session" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /word.*about|No words available/i }),
      ).toHaveFocus(),
    );
  });

  it("describes every action count in each populated activity bucket", () => {
    const snapshot = vocabularyRepository.getSnapshot();
    const list = snapshot.wordLists.find((candidate) => candidate.words.length > 0);
    expect(list).toBeDefined();
    const word = list?.words[0];
    expect(word).toBeDefined();
    if (!list || !word) {
      throw new Error("The built-in vocabulary list is empty.");
    }

    for (const action of ["known", "later", "skipped"] satisfies ReviewAction[]) {
      vocabularyRepository.setProgress(
        word.id,
        createEmptyProgress(word.id),
        createReviewEvent({ list, word }, action, 1),
      );
    }

    window.history.replaceState(null, "", "#view=vocabulary&section=activity");
    renderWorkspace();

    expect(
      screen.getByRole("img", {
        name: /3 reviews; 1 known answer; 1 Later answer; 1 skipped answer/i,
      }),
    ).toBeInTheDocument();
  });
});
