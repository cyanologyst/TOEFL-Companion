import type { StudyActivity, StudyState } from "../../types/study";
import type { VocabularyStats } from "../../types/vocabulary";

export interface DayBar {
  key: string;
  label: string;
  vocabulary: number;
  reading: number;
  speaking: number;
  writing: number;
  total: number;
}

export interface MasterySlice {
  name: string;
  value: number;
  tone: "new" | "learning" | "familiar" | "mastered";
}

export interface AccuracyPoint {
  index: number;
  label: string;
  accuracy: number;
}

export function dayKey(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

/** Last 14 days of activity, oldest first, so the chart reads left to right. */
export function activityByDay(activities: StudyActivity[], now = new Date()): DayBar[] {
  const buckets = new Map<string, DayBar>();
  for (let back = 13; back >= 0; back -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - back);
    buckets.set(dayKey(date), {
      key: dayKey(date),
      label: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date),
      vocabulary: 0,
      reading: 0,
      speaking: 0,
      writing: 0,
      total: 0,
    });
  }

  for (const activity of activities) {
    const bar = buckets.get(dayKey(new Date(activity.createdAt)));
    if (!bar) {
      continue;
    }
    bar[activity.kind] += 1;
    bar.total += 1;
  }

  return [...buckets.values()];
}

export function masteryBreakdown(stats: VocabularyStats): MasterySlice[] {
  const slices: MasterySlice[] = [
    { name: "Mastered", value: stats.mastered, tone: "mastered" },
    { name: "Familiar", value: stats.familiar, tone: "familiar" },
    { name: "Learning", value: stats.learning, tone: "learning" },
    { name: "Not started", value: stats.new, tone: "new" },
  ];
  return slices.filter((slice) => slice.value > 0);
}

/** Repetition accuracy over time, most recent 20 attempts. */
export function accuracyTrend(state: StudyState): AccuracyPoint[] {
  return [...state.listenRepeatAttempts]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-20)
    .map((attempt, index) => ({
      index: index + 1,
      label: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
        new Date(attempt.createdAt),
      ),
      accuracy: Math.round(attempt.accuracy),
    }));
}

export function writingSubmissionCount(state: StudyState): number {
  return Object.values(state.writing).reduce(
    (total, record) => total + record.submissions.length,
    0,
  );
}

/** Consecutive days with activity, counting back from today. */
export function studyStreak(activities: StudyActivity[], now = new Date()): number {
  const done = new Set(activities.map((a) => dayKey(new Date(a.createdAt))));
  let streak = 0;
  const cursor = new Date(now);
  for (let index = 0; index < 400; index += 1) {
    if (!done.has(dayKey(cursor))) {
      if (index === 0) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function hasAnyHistory(
  stats: VocabularyStats,
  speakingAttempts: number,
  state: StudyState,
): boolean {
  return (
    stats.totalReviews > 0 ||
    speakingAttempts > 0 ||
    state.listenRepeatAttempts.length > 0 ||
    state.activities.length > 0 ||
    writingSubmissionCount(state) > 0
  );
}
