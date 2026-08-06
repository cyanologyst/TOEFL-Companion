import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { studyRepository } from "../../services/studyRepository";
import { WritingPage } from "./WritingPage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("WritingPage", () => {
  it("uses one direct exam-style workflow without practice-mode controls", () => {
    render(
      <WritingPage
        initialSnapshot={studyRepository.getSnapshot()}
        timeLimitSeconds={600}
        onNotice={vi.fn()}
        onChanged={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Academic Discussion" })).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Your Academic Discussion response" }),
    ).toBeVisible();

    const toolbar = screen.getByRole("toolbar", { name: "Writing editor toolbar" });
    expect(within(toolbar).getByText("Exam conditions")).toBeVisible();
    expect(within(toolbar).getByText("Plain-text TOEFL response")).toBeVisible();

    expect(screen.queryByRole("tablist", { name: "Writing mode" })).not.toBeInTheDocument();
    expect(screen.queryByText("Plan your response")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View feedback" })).not.toBeInTheDocument();
    expect(screen.queryByText("Feedback workspace")).not.toBeInTheDocument();

    // Drafts save themselves as you type; a manual Save button only invited a
    // mid-sentence click, so Submit is the single action in the editor.
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeVisible();
  });
});
