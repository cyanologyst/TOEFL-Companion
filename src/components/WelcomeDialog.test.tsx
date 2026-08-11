import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./VocabularyReminderHost", () => ({
  VocabularyReminderHost: () => null,
}));

import { App } from "../App";
import { studyRepository } from "../services/studyRepository";
import { TooltipProvider } from "./StudyUI";

function renderApp() {
  return render(
    <TooltipProvider>
      <App />
    </TooltipProvider>,
  );
}

function welcome() {
  return screen.queryByRole("dialog", { name: "Welcome to TOEFL Companion" });
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "#view=dashboard");
});

describe("first launch", () => {
  it("asks for a name and stores it in the study settings", () => {
    renderApp();

    expect(welcome()).toBeInTheDocument();
    const start = screen.getByRole("button", { name: "Start studying" });
    expect(start).toBeDisabled();

    fireEvent.change(screen.getByLabelText("What should the app call you?"), {
      target: { value: "  Mohammad  " },
    });
    expect(start).toBeEnabled();
    fireEvent.click(start);

    const settings = studyRepository.getSnapshot().settings;
    expect(settings.learnerName).toBe("Mohammad");
    expect(settings.onboarded).toBe(true);
    expect(welcome()).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mohammad");
  });

  it("does not ask a learner who has already answered", () => {
    studyRepository.completeOnboarding("Mohammad");

    renderApp();

    expect(welcome()).not.toBeInTheDocument();
  });

  it("asks again next launch when the dialog is closed unanswered", () => {
    const first = renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(welcome()).not.toBeInTheDocument();
    expect(studyRepository.getSnapshot().settings.onboarded).toBe(false);
    first.unmount();

    renderApp();

    expect(welcome()).toBeInTheDocument();
  });
});

describe("stored settings", () => {
  it("treats the old placeholder name as never answered", () => {
    window.localStorage.setItem(
      "toefl-companion:study:v1",
      JSON.stringify({
        schemaVersion: 1,
        writing: {},
        listenRepeatAttempts: [],
        activities: [],
        settings: { learnerName: "Alex" },
      }),
    );

    expect(studyRepository.getSnapshot().settings.onboarded).toBe(false);
  });

  it("keeps a name the learner chose before the welcome dialog existed", () => {
    window.localStorage.setItem(
      "toefl-companion:study:v1",
      JSON.stringify({
        schemaVersion: 1,
        writing: {},
        listenRepeatAttempts: [],
        activities: [],
        settings: { learnerName: "Mohammad" },
      }),
    );

    const settings = studyRepository.getSnapshot().settings;
    expect(settings.learnerName).toBe("Mohammad");
    expect(settings.onboarded).toBe(true);
  });
});
