import type { StudyActivity, StudySettings } from "../../types/study";
import type { VocabularyStats } from "../../types/vocabulary";

export type StudyArea = "vocabulary" | "speaking" | "writing";

export interface SessionSuggestion {
  area: StudyArea;
  /** What the learner will do, in their words. */
  title: string;
  /** Why this is being suggested now. */
  reason: string;
  minutes: number;
  action: string;
  /** Completed portion of this area's long-run goal, 0-100. */
  progress: number;
  image: string;
}

export interface DashboardModel {
  greeting: string;
  daysToTest: number | null;
  testDateLabel: string | null;
  primary: SessionSuggestion;
  secondary: SessionSuggestion[];
  reviewedToday: number;
  dailyGoal: number;
  dailyGoalPercent: number;
  streakDays: number;
  week: DayCell[];
  totalMinutes: number;
  hasHistory: boolean;
}

export interface DayCell {
  id: string;
  shortLabel: string;
  fullLabel: string;
  complete: boolean;
  isToday: boolean;
  isFuture: boolean;
}

const MINUTES_PER_SPEAKING_ATTEMPT = 3;
const WORDS_TARGET = 614;
const SPEAKING_QUESTION_TOTAL = 120;
const WRITING_TASK_TOTAL = 30;

function greetingFor(hour: number): string {
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

export function dayKey(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

/**
 * Whole days from today until the test. Negative once the date has passed,
 * null when the learner has not set one.
 */
export function daysUntil(iso: string, now: Date): number | null {
  if (!iso) {
    return null;
  }
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** Consecutive days with recorded activity, counting back from today. */
export function currentStreak(activities: StudyActivity[], now: Date): number {
  const keys = new Set(activities.map((a) => dayKey(new Date(a.createdAt))));
  let streak = 0;
  const cursor = new Date(now);
  for (let index = 0; index < 400; index += 1) {
    if (!keys.has(dayKey(cursor))) {
      // Today not being logged yet does not break a run that is still alive.
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

export function buildWeek(activities: StudyActivity[], now: Date): DayCell[] {
  const done = new Set(activities.map((a) => dayKey(new Date(a.createdAt))));
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const todayKey = dayKey(now);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const id = dayKey(date);
    return {
      id,
      shortLabel: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date),
      fullLabel: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date),
      complete: done.has(id),
      isToday: id === todayKey,
      isFuture: id > todayKey,
    };
  });
}

/**
 * Minutes a vocabulary session will actually take, using the learner's own
 * measured pace once there is one rather than a fixed guess.
 */
export function vocabularyMinutes(count: number, averageResponseSeconds: number): number {
  if (count <= 0) {
    return 0;
  }
  const perWord = averageResponseSeconds > 0 ? averageResponseSeconds : 5;
  return Math.max(1, Math.round((count * perWord) / 60));
}

function vocabularySuggestion(stats: VocabularyStats, sessionSize: number): SessionSuggestion {
  const due = stats.dueNow;
  const fresh = stats.new;
  const count = Math.min(sessionSize, due > 0 ? due : fresh);
  const isDue = due > 0;

  return {
    area: "vocabulary",
    title: count > 0 ? `Review ${count} ${count === 1 ? "word" : "words"}` : "Browse your words",
    reason: isDue
      ? `${due} due for recall`
      : fresh > 0
        ? `${fresh} not started yet`
        : "Nothing due — you are ahead",
    minutes: vocabularyMinutes(count, stats.averageResponseSeconds),
    action: count > 0 ? "Start review" : "Open library",
    progress: stats.totalWords ? (stats.mastered / stats.totalWords) * 100 : 0,
    image: "/assets/dashboard/vocabulary-cards.webp",
  };
}

function speakingSuggestion(attempts: number, interviewSeconds: number): SessionSuggestion {
  return {
    area: "speaking",
    title: "Answer one interview question",
    reason:
      attempts > 0
        ? `${attempts} saved ${attempts === 1 ? "attempt" : "attempts"} so far`
        : "Record your first answer",
    minutes: Math.max(2, Math.round((interviewSeconds * 3) / 60) + MINUTES_PER_SPEAKING_ATTEMPT),
    action: attempts > 0 ? "Continue speaking" : "Try speaking",
    progress: Math.min(100, (attempts / SPEAKING_QUESTION_TOTAL) * 100),
    image: "/assets/dashboard/speaking-profile.webp",
  };
}

function writingSuggestion(submissions: number, writingSeconds: number): SessionSuggestion {
  return {
    area: "writing",
    title: "Write one discussion response",
    reason:
      submissions > 0
        ? `${submissions} submitted ${submissions === 1 ? "response" : "responses"}`
        : "Respond to a professor's question",
    minutes: Math.max(5, Math.round(writingSeconds / 60)),
    action: submissions > 0 ? "Continue writing" : "Try writing",
    progress: Math.min(100, (submissions / WRITING_TASK_TOTAL) * 100),
    image: "/assets/dashboard/writing-page.webp",
  };
}

/**
 * Picks what to put in front of the learner. Due vocabulary wins because it
 * decays; otherwise the least-practised skill gets the slot.
 */
export function buildDashboard(
  settings: StudySettings,
  stats: VocabularyStats,
  speakingAttempts: number,
  writingSubmissions: number,
  activities: StudyActivity[],
  now: Date = new Date(),
): DashboardModel {
  const vocabulary = vocabularySuggestion(stats, stats.dailyReviewGoal || 20);
  const speaking = speakingSuggestion(speakingAttempts, settings.interviewSeconds);
  const writing = writingSuggestion(writingSubmissions, settings.writingSeconds);

  const ordered: SessionSuggestion[] =
    stats.dueNow > 0
      ? [vocabulary, speaking, writing]
      : [speaking, writing, vocabulary].sort((a, b) => a.progress - b.progress);

  const daysToTest = daysUntil(settings.targetTestDate, now);
  const week = buildWeek(activities, now);
  const goal = stats.dailyReviewGoal || 20;

  return {
    greeting: greetingFor(now.getHours()),
    daysToTest,
    testDateLabel: settings.targetTestDate
      ? new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(
          new Date(`${settings.targetTestDate}T00:00:00`),
        )
      : null,
    primary: ordered[0],
    secondary: ordered.slice(1),
    reviewedToday: stats.reviewedToday,
    dailyGoal: goal,
    dailyGoalPercent: Math.min(100, goal > 0 ? (stats.reviewedToday / goal) * 100 : 0),
    streakDays: currentStreak(activities, now),
    week,
    totalMinutes: ordered.reduce((sum, item) => sum + item.minutes, 0),
    hasHistory: activities.length > 0,
  };
}

export { WORDS_TARGET };
