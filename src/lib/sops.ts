import { addDays } from "./calendar-dates";

/**
 * When a procedure goes stale.
 *
 * Small, pure, and tested, because it decides what the SOP screen shouts about
 * -- and a review reminder that is wrong in either direction destroys the
 * feature. Too eager and people learn to ignore it; too slack and the library
 * quietly fills up with instructions for a way of working nobody uses any more.
 */

/** How long before the due date a procedure starts warning. */
export const DUE_SOON_DAYS = 30;

export type ReviewState = "never" | "overdue" | "due_soon" | "current";

/**
 * The day a review falls due: the last review plus the interval.
 *
 * `null` when it has never been reviewed. That is deliberately *not* the same
 * as overdue: a procedure written last week and not yet reviewed is fine, and
 * one written two years ago and never reviewed is the worst case in the
 * library. Both say "never", and the list sorts the old ones to the top rather
 * than pretending the distinction does not exist.
 */
export function reviewDueOn(lastReviewedOn: string | null, intervalDays: number): string | null {
  if (!lastReviewedOn) return null;
  return addDays(lastReviewedOn, Math.max(1, intervalDays));
}

/**
 * Where a procedure stands today.
 *
 * Four states rather than a boolean, because "never reviewed" and "reviewed
 * and now out of date" are different problems with different fixes, and
 * "due in a fortnight" is worth surfacing before it becomes a red mark.
 */
export function reviewState(
  lastReviewedOn: string | null,
  intervalDays: number,
  today: string,
): ReviewState {
  if (!lastReviewedOn) return "never";

  const due = reviewDueOn(lastReviewedOn, intervalDays);
  if (!due) return "never";

  if (due <= today) return "overdue";
  if (due <= addDays(today, DUE_SOON_DAYS)) return "due_soon";
  return "current";
}

/** Whether this one belongs in the section at the top of the screen. */
export function needsAttention(state: ReviewState): boolean {
  return state === "never" || state === "overdue";
}

/**
 * The order the list is read in.
 *
 * Worst first, and within a state the one left longest comes first -- which is
 * the one most likely to be telling somebody to do the wrong thing. A never-
 * reviewed procedure written long ago outranks one written yesterday, so the
 * fallback sort is the creation date.
 */
const RANK: Record<ReviewState, number> = {
  overdue: 0,
  never: 1,
  due_soon: 2,
  current: 3,
};

export function compareByUrgency(
  a: { state: ReviewState; lastReviewedOn: string | null; createdAt: Date; title: string },
  b: { state: ReviewState; lastReviewedOn: string | null; createdAt: Date; title: string },
): number {
  if (RANK[a.state] !== RANK[b.state]) return RANK[a.state] - RANK[b.state];

  // Longest untouched first. A never-reviewed one is ranked by when it was
  // written, since that is the last time anybody looked at the words.
  const aWhen = a.lastReviewedOn ?? a.createdAt.toISOString().slice(0, 10);
  const bWhen = b.lastReviewedOn ?? b.createdAt.toISOString().slice(0, 10);
  if (aWhen !== bWhen) return aWhen.localeCompare(bWhen);

  return a.title.localeCompare(b.title);
}
