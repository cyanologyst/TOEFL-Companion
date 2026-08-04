import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import rawTopics from "../data/toefl-data.json";
import type { Topic } from "../types/toefl";
import { SpeakingStudyMaterials } from "./SpeakingStudyMaterials";

const firstQuestion = (rawTopics as Topic[])[0].questions[0];

describe("SpeakingStudyMaterials", () => {
  it("shows reference content without selection controls and lets a phrase be copied", async () => {
    const onNotice = vi.fn();
    const user = userEvent.setup();
    render(<SpeakingStudyMaterials question={firstQuestion} onNotice={onNotice} />);

    expect(screen.getByRole("heading", { name: "Ideas" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Collocations" })).toBeVisible();
    expect(screen.getByText(firstQuestion.ideas[0])).toBeVisible();
    expect(screen.getByText("stick to a regular routine")).toBeVisible();
    expect(screen.getByText("follow it consistently")).toBeVisible();
    const copyActions = screen.getAllByRole("button", {
      name: /copy collocation/i,
    });
    expect(copyActions).toHaveLength(firstQuestion.collocations.length);

    await user.click(copyActions[0]);
    expect(onNotice).toHaveBeenCalledWith("Copied “stick to a regular routine”.");
  });
});
