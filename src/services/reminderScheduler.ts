import { getNextReminderAt, isQuietHours } from "../features/vocabulary/vocabularyEngine";
import type { VocabularySnapshot, WordLocation } from "./vocabularyRepository";

/**
 * When the vocabulary reminder is allowed to appear, and which word it shows.
 *
 * The rules live here rather than in the component so they can be reasoned
 * about and tested without a DOM: the previous version made these decisions
 * inside a `useEffect` whose dependencies changed on every vocabulary write, so
 * saving a review silently rescheduled the timer and the card could go a whole
 * session without appearing.
 */

/** A slot that arrives at a bad moment is pushed back, never skipped. */
export const DEFER_SECONDS = 90;

/** Short, so the card appears almost at once when the window comes back. */
export const HIDDEN_RETRY_SECONDS = 5;

export type ReminderBlock =
  | "off"
  | "paused"
  | "quiet-hours"
  | "no-enabled-words"
  | "already-showing"
  | "busy"
  | "hidden"
  | "not-due";

export type ReminderDecision =
  | { kind: "wait" }
  | { kind: "schedule"; at: string | null }
  | { kind: "defer"; at: string; reason: ReminderBlock }
  | { kind: "fire"; location: WordLocation; nextAt: string | null };

export interface ReminderContext {
  snapshot: VocabularySnapshot;
  nowMs: number;
  /** True while a card is already on screen. */
  showing: boolean;
  /** False while the learner is mid-task and must not be interrupted. */
  interruptible: boolean;
  /** The word shown last, so the same one is not offered twice in a row. */
  lastWordId: string | null;
  /** False when the window is minimised or behind another. */
  visible?: boolean;
  random?: () => number;
}

/** The in-app card is only worth spending a slot on if it can be seen. */
export function usesInAppCard(mode: string): boolean {
  return mode === "popup" || mode === "both";
}

/**
 * Enabled collections only. This is the whole contract of the feature: a
 * collection switched off in the library is not revised, and the reminder is
 * revision.
 */
export function reminderCandidates(snapshot: VocabularySnapshot): WordLocation[] {
  const seen = new Set<string>();
  const candidates: WordLocation[] = [];
  for (const list of snapshot.wordLists) {
    if (!list.isEnabled) {
      continue;
    }
    for (const word of list.words) {
      const key = word.id.trim().toLocaleLowerCase();
      if (!key || !word.term.trim() || seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push({ word, list });
    }
  }
  return candidates;
}

/**
 * Due first, then the ones going wrong most often. A word with no history at
 * all counts as due: it has never been seen, which is the most overdue a word
 * can be.
 */
function byPriority(
  candidates: WordLocation[],
  snapshot: VocabularySnapshot,
  nowMs: number,
): WordLocation[] {
  const dueAt = (location: WordLocation): number => {
    const entry = snapshot.progress[location.word.id];
    if (!entry) {
      return Number.NEGATIVE_INFINITY;
    }
    const parsed = Date.parse(entry.dueAt);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };

  return candidates
    .filter((location) => dueAt(location) <= nowMs)
    .sort((left, right) => {
      const dueDifference = dueAt(left) - dueAt(right);
      if (dueDifference !== 0) {
        return dueDifference;
      }
      const leftProgress = snapshot.progress[left.word.id];
      const rightProgress = snapshot.progress[right.word.id];
      const lapses = (rightProgress?.lapses ?? 0) - (leftProgress?.lapses ?? 0);
      if (lapses !== 0) {
        return lapses;
      }
      return (rightProgress?.memoryDifficulty ?? 5) - (leftProgress?.memoryDifficulty ?? 5);
    });
}

export function chooseReminderWord(
  snapshot: VocabularySnapshot,
  nowMs: number,
  lastWordId: string | null,
  random: () => number = Math.random,
): WordLocation | null {
  const candidates = reminderCandidates(snapshot);
  if (!candidates.length) {
    return null;
  }

  // Never the same word twice running, unless it is the only one enabled.
  const fresh =
    candidates.length > 1
      ? candidates.filter((location) => location.word.id !== lastWordId)
      : candidates;

  if (snapshot.settings.selectionMode === "random") {
    const index = Math.min(fresh.length - 1, Math.max(0, Math.floor(random() * fresh.length)));
    return fresh[index] ?? null;
  }

  const due = byPriority(fresh, snapshot, nowMs);
  if (due.length) {
    return due[0] ?? null;
  }
  // Nothing is due yet, so this is practice rather than revision: take any.
  const index = Math.min(fresh.length - 1, Math.max(0, Math.floor(random() * fresh.length)));
  return fresh[index] ?? null;
}

/**
 * The single decision the host acts on each tick. Pure, so the whole policy is
 * testable without timers or a DOM.
 */
export function decideReminder(context: ReminderContext): ReminderDecision {
  const { snapshot, nowMs, showing, interruptible, lastWordId } = context;
  const nowIso = new Date(nowMs).toISOString();
  const settings = snapshot.settings;

  if (settings.notificationMode === "off") {
    return snapshot.nextReminderAt ? { kind: "schedule", at: null } : { kind: "wait" };
  }

  // A collection can be switched off at any time; without one there is nothing
  // to revise and no reason to hold a schedule.
  if (!reminderCandidates(snapshot).length) {
    return snapshot.nextReminderAt ? { kind: "schedule", at: null } : { kind: "wait" };
  }

  const pausedUntil = snapshot.pausedUntil ? Date.parse(snapshot.pausedUntil) : Number.NaN;
  if (Number.isFinite(pausedUntil) && pausedUntil > nowMs) {
    return { kind: "wait" };
  }

  const scheduledAt = snapshot.nextReminderAt ? Date.parse(snapshot.nextReminderAt) : Number.NaN;
  if (!Number.isFinite(scheduledAt)) {
    return { kind: "schedule", at: getNextReminderAt(settings, nowIso) };
  }
  if (scheduledAt > nowMs) {
    return { kind: "wait" };
  }

  if (isQuietHours(settings, nowIso)) {
    return { kind: "schedule", at: getNextReminderAt(settings, nowIso) };
  }
  if (showing) {
    return { kind: "wait" };
  }
  /* A card that appears while the window is minimised expires unseen and
     spends the slot for nothing. Hold it until the app is back in front; the
     system notification is what covers the background case. */
  if (context.visible === false && usesInAppCard(settings.notificationMode)) {
    return {
      kind: "defer",
      at: new Date(nowMs + HIDDEN_RETRY_SECONDS * 1_000).toISOString(),
      reason: "hidden",
    };
  }
  if (!interruptible) {
    return {
      kind: "defer",
      at: new Date(nowMs + DEFER_SECONDS * 1_000).toISOString(),
      reason: "busy",
    };
  }

  const location = chooseReminderWord(snapshot, nowMs, lastWordId, context.random);
  if (!location) {
    return { kind: "schedule", at: getNextReminderAt(settings, nowIso) };
  }
  return { kind: "fire", location, nextAt: getNextReminderAt(settings, nowIso) };
}

/**
 * A reminder is an interruption, so it waits for a natural gap. Recording,
 * a running exam timer, an open dialog, and typing all count as mid-task.
 */
export function isInterruptible(doc: Document = document): boolean {
  if (doc.querySelector('[role="dialog"]')) {
    return false;
  }
  if (doc.querySelector("[data-recording='true'], .vocab-reminder")) {
    return false;
  }
  const active = doc.activeElement;
  if (
    active instanceof HTMLElement &&
    (active.isContentEditable ||
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "SELECT")
  ) {
    return false;
  }
  return true;
}
