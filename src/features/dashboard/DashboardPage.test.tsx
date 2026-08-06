import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StudyActivity, StudySettings } from "../../types/study";
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

const settings: StudySettings = {
  learnerName: "Alex",
  targetTestDate: "",
  interviewSeconds: 40,
  writingSeconds: 600,
  autoSaveWriting: true,
  playSounds: true,
};

function renderDashboard(
  overrides: {
    settings?: Partial<StudySettings>;
    stats?: Partial<VocabularyStats>;
    activities?: StudyActivity[];
    onNavigate?: (area: string) => void;
  } = {},
) {
  const onNavigate = overrides.onNavigate ?? vi.fn();
  const result = render(
    <DashboardPage
      settings={{ ...settings, ...overrides.settings }}
      vocabularyStats={{ ...vocabularyStats, ...overrides.stats }}
      speakingAttempts={8}
      writingSubmissions={3}
      activities={overrides.activities ?? []}
      onNavigate={onNavigate}
    />,
  );
  return { ...result, onNavigate };
}

describe("DashboardPage", () => {
  it("leads with one recommended session rather than repeating every area", () => {
    const { container } = renderDashboard();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alex");

    // Due vocabulary decays, so it takes the hero over the other skills.
    expect(screen.getByRole("region", { name: "Recommended session" })).toBeVisible();
    expect(screen.getByText("Review 18 words")).toBeVisible();
    expect(screen.getByText("18 due for recall")).toBeVisible();

    // Each area is offered exactly once as a quick jump.
    expect(container.querySelectorAll(".dash-b-skill")).toHaveLength(3);
  });

  it("routes the hero action to its area", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderDashboard({ onNavigate });

    await user.click(screen.getByRole("button", { name: /Start review/ }));
    expect(onNavigate).toHaveBeenLastCalledWith("vocabulary");
  });

  it("routes each skill tile to its area", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = renderDashboard({ onNavigate });

    const tiles = container.querySelectorAll<HTMLButtonElement>(".dash-b-skill");
    await user.click(tiles[1]);
    expect(onNavigate).toHaveBeenLastCalledWith("speaking");
    await user.click(tiles[2]);
    expect(onNavigate).toHaveBeenLastCalledWith("writing");
  });

  it("stamps the countdown once a test date is set", () => {
    const inTenDays = new Date();
    inTenDays.setDate(inTenDays.getDate() + 10);

    renderDashboard({ settings: { targetTestDate: inTenDays.toLocaleDateString("en-CA") } });

    expect(screen.getByText("10")).toBeVisible();
    expect(screen.getByText("days left")).toBeVisible();
  });

  it("invites a first session rather than reporting a wall of zeros", () => {
    renderDashboard({
      stats: { dueNow: 0, new: 0, mastered: 0, reviewedToday: 0, totalReviews: 0 },
    });

    expect(screen.getByText("Everything is ready to begin")).toBeVisible();
    expect(screen.getByText("No streak yet")).toBeVisible();
    expect(screen.getByText(/One session starts the run/)).toBeVisible();
  });

  it("shows the week strip with today marked", () => {
    const { container } = renderDashboard();
    const days = container.querySelectorAll(".dash-b__week-row li");
    expect(days).toHaveLength(7);
    expect(container.querySelectorAll('[data-today="true"]')).toHaveLength(1);
  });
});
