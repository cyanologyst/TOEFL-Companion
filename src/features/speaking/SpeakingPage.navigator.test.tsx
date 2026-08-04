import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../../components/StudyUI";
import rawTopics from "../../data/toefl-data.json";
import { learningRepository } from "../../services/learningRepository";
import type { Topic } from "../../types/toefl";
import { SpeakingPage } from "./SpeakingPage";

const topics = rawTopics as Topic[];
const finalTopic = topics.at(-1)!;

function resetSpeakingRepository(): void {
  learningRepository.setHistory([]);
  learningRepository.setSavedKeys([]);
  learningRepository.setTargetPhrases({});
  learningRepository.setCollapsedCategories([]);
}

function renderSpeakingPage(initialTopicId?: string) {
  const props = {
    interviewSeconds: 40,
    initialTopicId,
    onDirtyChange: vi.fn(),
    onNotice: vi.fn(),
    onSaved: vi.fn(),
  };

  return {
    ...render(
      <TooltipProvider delayDuration={0}>
        <SpeakingPage {...props} />
      </TooltipProvider>,
    ),
    props,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetSpeakingRepository();
});

afterEach(() => {
  resetSpeakingRepository();
  window.localStorage.clear();
});

describe("SpeakingPage topic navigator", () => {
  it("presents all 50 scenarios without exposing prompt text before a recording", async () => {
    const user = userEvent.setup();
    renderSpeakingPage();

    await user.click(screen.getByRole("tab", { name: "Listen & Repeat" }));

    const scenarioPicker = screen.getByRole("combobox", { name: "Scenario" });
    const queue = screen.getByRole("complementary", {
      name: "Listen and Repeat prompt queue",
    });

    expect(scenarioPicker).toHaveValue("0");
    expect(within(scenarioPicker).getAllByRole("option")).toHaveLength(50);
    expect(within(queue).getAllByRole("button")).toHaveLength(7);
    expect(within(queue).getByText("Campus Café Orientation")).toBeVisible();
    expect(within(queue).getByRole("button", { name: /^Prompt 1, 0:02$/u })).toBeVisible();
    expect(within(queue).getByText("Prompt 7")).toBeVisible();
    expect(screen.queryByText("Welcome to the Campus Cafe.")).not.toBeInTheDocument();
    expect(screen.getByText("Transcription hidden")).toBeVisible();
    expect(screen.getByText("Original source clip")).toBeVisible();
    expect(screen.getByText("00:08 remaining")).toBeVisible();
    expect(screen.getByText("8-second response, no preparation time.")).toBeVisible();

    await user.click(within(queue).getByRole("button", { name: "Prompt 3, 0:03" }));
    expect(screen.getByText("00:10 remaining")).toBeVisible();

    await user.click(within(queue).getByRole("button", { name: "Prompt 6, 0:07" }));
    expect(screen.getByText("00:12 remaining")).toBeVisible();

    await user.click(within(queue).getByRole("button", { name: "Prompt 1, 0:02" }));

    await user.click(screen.getByRole("button", { name: "Show transcription" }));

    expect(screen.getByText("Welcome to the Campus Cafe.")).toBeVisible();
    expect(screen.queryByText("Transcription hidden")).not.toBeInTheDocument();

    await user.selectOptions(scenarioPicker, "1");

    expect(scenarioPicker).toHaveValue("1");
    expect(within(queue).getAllByRole("button")).toHaveLength(7);
    expect(within(queue).getByText("Library Print Station")).toBeVisible();
    expect(screen.queryByText("Welcome to the print station.")).not.toBeInTheDocument();
    expect(screen.getByText("Transcription hidden")).toBeVisible();

    await user.selectOptions(scenarioPicker, "49");

    expect(within(queue).getAllByRole("button")).toHaveLength(7);
    expect(within(queue).getByText("Final Exam Instructions")).toBeVisible();
    expect(screen.queryByText("Welcome to your final exam session.")).not.toBeInTheDocument();
  });

  it("exposes all 30 grouped topics and supports roving to the final topic", async () => {
    const user = userEvent.setup();
    renderSpeakingPage();

    const navigator = screen.getByRole("navigation", { name: "Interview topics" });
    const topicButtons = within(navigator).getAllByRole("button");

    expect(topicButtons).toHaveLength(30);
    expect(topicButtons[0]).toHaveAttribute("tabindex", "0");
    expect(topicButtons.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tabIndex: -1,
        }),
      ]),
    );

    topicButtons[0].focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(
      within(navigator).getByRole("button", {
        name: /Learning New Hobbies/i,
      }),
    ).toHaveFocus();

    await user.keyboard("{End}");

    const finalTopicButton = within(navigator).getByRole("button", {
      name: new RegExp(finalTopic.title, "i"),
    });
    expect(finalTopicButton).toHaveFocus();
    expect(finalTopicButton).toHaveAttribute("aria-current", "page");
    expect(
      within(screen.getByRole("region", { name: "Question preview" })).getByRole("tablist", {
        name: `${finalTopic.title} questions`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: finalTopic.title }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1, name: "Speaking" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: finalTopic.title }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record response" })).not.toBeInTheDocument();
  });

  it("exposes a complete Q1-Q4 tab structure before opening the interview recorder", async () => {
    const user = userEvent.setup();
    renderSpeakingPage(String(finalTopic.id));

    const preview = screen.getByRole("region", { name: "Question preview" });
    const questionTablist = within(preview).getByRole("tablist", {
      name: `${finalTopic.title} questions`,
    });
    const questionTabs = within(questionTablist).getAllByRole("tab");

    expect(questionTabs.map((tab) => tab.textContent)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(questionTabs[0]).toHaveAttribute("aria-selected", "true");
    expect(questionTabs[0]).toHaveAttribute("tabindex", "0");
    questionTabs.slice(1).forEach((tab) => {
      expect(tab).toHaveAttribute("aria-selected", "false");
      expect(tab).toHaveAttribute("tabindex", "-1");
    });

    const controlledPanels = questionTabs.map((tab) => {
      const panelId = tab.getAttribute("aria-controls");
      expect(panelId).toBeTruthy();
      const panel = document.getElementById(panelId!);
      expect(panel).toHaveAttribute("role", "tabpanel");
      expect(panel).toHaveAttribute("aria-labelledby", tab.id);
      return panel!;
    });
    expect(controlledPanels[0]).not.toHaveAttribute("hidden");
    controlledPanels.slice(1).forEach((panel) => {
      expect(panel).toHaveAttribute("hidden");
    });
    expect(within(preview).getByRole("tabpanel")).toHaveTextContent(finalTopic.questions[0].prompt);

    await user.click(within(questionTablist).getByRole("tab", { name: "Q4" }));

    expect(questionTabs[3]).toHaveAttribute("aria-selected", "true");
    expect(questionTabs[3]).toHaveAttribute("tabindex", "0");
    expect(questionTabs[0]).toHaveAttribute("aria-selected", "false");
    expect(questionTabs[0]).toHaveAttribute("tabindex", "-1");
    expect(controlledPanels[0]).toHaveAttribute("hidden");
    expect(controlledPanels[3]).not.toHaveAttribute("hidden");
    expect(within(preview).getByRole("tabpanel")).toHaveTextContent(finalTopic.questions[3].prompt);

    await user.click(screen.getByRole("button", { name: "Start practice" }));

    expect(screen.getByRole("heading", { level: 1, name: finalTopic.title })).toBeInTheDocument();
    expect(screen.getByText(finalTopic.questions[3].prompt)).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Response timer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Record response" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Interview topics" })).not.toBeInTheDocument();
  });

  it("opens complete Q4 Ideas, Collocations, and Sample Answers dialogs", async () => {
    const user = userEvent.setup();
    renderSpeakingPage(String(finalTopic.id));

    const preview = screen.getByRole("region", { name: "Question preview" });
    await user.click(within(preview).getByRole("tab", { name: "Q4" }));

    const activePanel = within(preview).getByRole("tabpanel");
    const question = finalTopic.questions[3];
    expect(activePanel).toHaveTextContent(question.prompt);

    const ideasTrigger = within(activePanel).getByRole("button", {
      name: `View all ${question.ideas.length} ideas`,
    });
    expect(ideasTrigger).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(ideasTrigger);

    const ideasDialog = screen.getByRole("dialog", { name: "Ideas to consider" });
    expect(ideasDialog).toHaveAccessibleDescription(/Online Shopping.*Question 4/u);
    expect(within(ideasDialog).getAllByRole("listitem")).toHaveLength(question.ideas.length);
    question.ideas.forEach((idea) => {
      expect(ideasDialog).toHaveTextContent(idea);
    });

    await user.click(within(ideasDialog).getByRole("button", { name: "Close dialog" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Ideas to consider" })).not.toBeInTheDocument();
    });

    const collocationsTrigger = within(activePanel).getByRole("button", {
      name: `View all ${question.collocations.length} collocations`,
    });
    expect(collocationsTrigger).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(collocationsTrigger);

    const collocationsDialog = screen.getByRole("dialog", { name: "Useful collocations" });
    expect(collocationsDialog).toHaveAccessibleDescription(/Online Shopping.*Question 4/u);
    const collocationRows = within(collocationsDialog).getAllByRole("listitem");
    expect(collocationRows).toHaveLength(question.collocations.length);
    question.collocations.forEach((collocation, index) => {
      const [phrase, explanation] = collocation.split(" — ", 2);
      expect(collocationRows[index]).toHaveTextContent(phrase);
      if (explanation) {
        expect(collocationRows[index]).toHaveTextContent(explanation);
      }
    });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Useful collocations" })).not.toBeInTheDocument();
    });

    const samplesTrigger = within(activePanel).getByRole("button", {
      name: "View both sample answers",
    });
    expect(samplesTrigger).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(samplesTrigger);

    const samplesDialog = screen.getByRole("dialog", { name: "Sample answers" });
    expect(samplesDialog).toHaveAccessibleDescription(/Online Shopping.*Question 4/u);
    expect(
      within(samplesDialog).getByRole("heading", { level: 3, name: "Sample answer 1" }),
    ).toBeVisible();
    expect(
      within(samplesDialog).getByRole("heading", { level: 3, name: "Sample answer 2" }),
    ).toBeVisible();
    expect(within(samplesDialog).getByText(question.answer, { exact: true })).toBeVisible();
    expect(within(samplesDialog).getByText(question.answer2, { exact: true })).toBeVisible();

    await user.click(within(samplesDialog).getByRole("button", { name: "Close dialog" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Sample answers" })).not.toBeInTheDocument();
    });
  });
});
