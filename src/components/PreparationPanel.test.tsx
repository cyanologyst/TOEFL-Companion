import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import rawTopics from "../data/toefl-data.json";
import type { Topic } from "../types/toefl";
import { PreparationPanel } from "./PreparationPanel";

const firstQuestion = (rawTopics as Topic[])[0].questions[0];

describe("PreparationPanel", () => {
  it("shows model answers without requiring a completed response", async () => {
    const user = userEvent.setup();
    render(
      <PreparationPanel
        questionKey="1-1"
        question={firstQuestion}
        onNotice={vi.fn()}
        onRecordingSave={vi.fn()}
      />,
    );

    const modelAnswers = screen.getByRole("button", { name: /Model answers/i });
    expect(modelAnswers).toBeEnabled();
    await user.click(modelAnswers);

    expect(screen.getByRole("tab", { name: "Answer 1" })).toBeVisible();
    expect(screen.getByRole("tabpanel")).toHaveTextContent(firstQuestion.answer);
  });
});
