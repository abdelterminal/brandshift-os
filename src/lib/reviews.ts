import { addDays, startOfWeek } from "./calendar-dates";

/**
 * Which weeks were reviewed, and which were quietly skipped.
 *
 * The arithmetic is small; the reason it is here rather than inline is that
 * the whole value of a reviews screen is telling you about the weeks you
 * missed. A list of the reviews you did hold is a diary. A list of the ones
 * you did not is the thing that gets the meeting back in the calendar.
 */

/** Monday to Sunday, inclusive, for the week a review covers. */
export function weekRange(weekStart: string): { start: string; end: string } {
  return { start: weekStart, end: addDays(weekStart, 6) };
}

/** True when this is the week we are currently living in. */
export function isCurrentWeek(weekStart: string, today: string): boolean {
  return startOfWeek(today) === weekStart;
}

/**
 * The weeks that ended without a review.
 *
 * The current week is never "missed" -- it has not finished, and nagging
 * somebody on a Tuesday about a review of a week still in progress is how a
 * screen teaches people to ignore it. Neither is anything before the first
 * review that exists: an organization that started reviewing in March did not
 * skip January, it simply was not doing this yet.
 *
 * Returned newest first, which is the order they matter in.
 */
export function missedWeeks(
  reviewedWeekStarts: string[],
  today: string,
  lookbackWeeks = 12,
): string[] {
  if (reviewedWeekStarts.length === 0) return [];

  const held = new Set(reviewedWeekStarts);
  const earliest = [...reviewedWeekStarts].sort()[0];
  const thisWeek = startOfWeek(today);

  const missed: string[] = [];

  // Walk back from the week before this one; the current week is still open.
  for (let index = 1; index <= lookbackWeeks; index += 1) {
    const week = addDays(thisWeek, -7 * index);
    if (week < earliest) break;
    if (!held.has(week)) missed.push(week);
  }

  return missed;
}

/**
 * The week a new review should cover.
 *
 * The one just gone, not the one we are in. A review is a look back at a week
 * that has finished, and offering to review a week with three days left in it
 * produces a document that was out of date before it was published.
 */
export function weekToReview(today: string): string {
  return addDays(startOfWeek(today), -7);
}

/** Whether a week can still be reviewed: it has to have ended. */
export function canReview(weekStart: string, today: string): boolean {
  return weekStart < startOfWeek(today);
}
