import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./components/VocabularyReminderHost", () => ({
  VocabularyReminderHost: () => null,
}));

import { App } from "./App";
import { TooltipProvider } from "./components/StudyUI";
import { studyRepository } from "./services/studyRepository";

function renderApp() {
  return render(
    <TooltipProvider>
      <App />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // These cover a returning learner; the welcome dialog has its own test.
  studyRepository.completeOnboarding("Mohammad");
  window.history.replaceState(null, "", "#view=dashboard");
});

describe("unified application navigation", () => {
  it("opens the global study search with Ctrl+K", () => {
    renderApp();

    const wasNotCancelled = fireEvent.keyDown(window, {
      key: "k",
      ctrlKey: true,
    });

    expect(wasNotCancelled).toBe(false);
    expect(screen.getByRole("dialog", { name: "Search TOEFL Companion" })).toBeInTheDocument();
  });

  it("navigates between the main desktop study areas", () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Speaking" }));
    expect(screen.getByRole("heading", { level: 1, name: "Speaking" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#view=speaking");

    fireEvent.click(screen.getByRole("button", { name: "Writing" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Academic Discussion",
      }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#view=writing");
  });

  it("searches the built-in study content and opens its module", () => {
    renderApp();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(
      screen.getByPlaceholderText("Search words, speaking topics, and writing tasks…"),
      {
        target: { value: "technology" },
      },
    );

    const result = screen.getByRole("button", {
      name: /Technology in Daily Life/,
    });
    fireEvent.click(result);

    expect(
      screen.getByRole("tablist", { name: "Technology in Daily Life questions" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toMatch(/^#view=speaking&topic=/u);
  });
});
