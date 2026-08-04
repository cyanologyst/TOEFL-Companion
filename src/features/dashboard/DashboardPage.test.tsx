import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VocabularyStats } from "../../types/vocabulary";
import { DashboardPage } from "./DashboardPage";

const vocabularyStats: VocabularyStats = {
  totalWords: 614,
  reviewedWords: 120,
  dueNow: 18,
  difficultWords: 24,
  totalReviews: 220,
  knownReviews: 160,
  laterReviews: 45,
  skippedReviews: 15,
  recallRate: 73,
  averageResponseSeconds: 4.2,
  reviewedToday: 6,
  dailyReviewGoal: 20,
  dailyGoalProgress: 30,
  reviewStreakDays: 4,
  activeDays: 12,
  new: 494,
  learning: 54,
  familiar: 40,
  mastered: 26,
};

describe("DashboardPage", () => {
  it("renders the complete no-scroll dashboard information architecture", () => {
    const { container } = render(
      <DashboardPage
        settings={{
          learnerName: "Alex",
          targetTestDate: "",
          interviewSeconds: 40,
          writingSeconds: 600,
          autoSaveWriting: true,
          playSounds: true,
        }}
        vocabularyStats={vocabularyStats}
        speakingAttempts={8}
        writingSubmissions={3}
        activities={[]}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alex");
    expect(screen.getByRole("region", { name: "Today’s study plan" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Quick actions" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Continue studying" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Your progress overview" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Weekly study streak" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Recent activity" })).toBeVisible();
    expect(screen.getByText("The expert in anything was once a beginner.")).toBeVisible();

    const continuationCards = container.querySelectorAll(".dashboard-continue-card");
    expect(continuationCards).toHaveLength(3);
    expect(continuationCards[0]).toHaveClass("dashboard-continue-card--vocabulary");
    expect(continuationCards[1]).toHaveClass("dashboard-continue-card--speaking");
    expect(continuationCards[2]).toHaveClass("dashboard-continue-card--writing");
  });

  it("keeps the dashboard actions connected to the existing app navigation", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <DashboardPage
        settings={{
          learnerName: "Alex",
          targetTestDate: "",
          interviewSeconds: 40,
          writingSeconds: 600,
          autoSaveWriting: true,
          playSounds: true,
        }}
        vocabularyStats={vocabularyStats}
        speakingAttempts={8}
        writingSubmissions={3}
        activities={[]}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Smart review: Due vocabulary" }));
    expect(onNavigate).toHaveBeenLastCalledWith("vocabulary");

    await user.click(screen.getByRole("button", { name: "History: Study progress" }));
    expect(onNavigate).toHaveBeenLastCalledWith("progress");
  });
});
