/**
 * Turning a due date into what someone actually reads.
 *
 * `messages/*.json` already carries `Task.dueToday` / `Task.dueIn` /
 * `Task.overdueBy` -- ICU strings, plural-aware, in both locales -- from
 * whoever first modeled a due date and never wired them up. This is their
 * first real reader: a pure function from two `YYYY-MM-DD` strings to which
 * of those keys applies, so a row can say "in 3 days" instead of making
 * someone compare "14 Sep" against today in their head.
 *
 * A six-day window either side of today, matching the width `MyDay` already
 * uses to split "Next" from "Later" (`today/page.tsx`'s own `weekEnd`).
 * Outside it, the absolute date is the more useful answer -- "in 41 days"
 * doesn't save anyone the arithmetic "next month" already gives for free.
 */

export type DueDateLabel =
  | { kind: "today" }
  | { kind: "in"; days: number }
  | { kind: "overdueBy"; days: number }
  | { kind: "absolute" };

/** Calendar days between two `YYYY-MM-DD` strings, positive when `to` is later. */
function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function dueDateLabel(dueDateIso: string, todayIso: string): DueDateLabel {
  const diff = daysBetween(todayIso, dueDateIso);

  if (diff === 0) return { kind: "today" };
  if (diff > 0 && diff <= 6) return { kind: "in", days: diff };
  if (diff < 0 && diff >= -6) return { kind: "overdueBy", days: -diff };
  return { kind: "absolute" };
}

/**
 * Whether a task is actually late right now, independent of its status.
 *
 * A task only reads as late once someone marks it Blocked today -- this is
 * the fact that check is missing: a `todo` or `in_progress` task whose date
 * has simply passed. `done`/`cancelled` are exempt -- finished or abandoned
 * work was never going to "restart on its own" either way.
 */
export function isOverdue(
  dueDateIso: string | null,
  todayIso: string,
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled",
): boolean {
  return dueDateIso !== null && dueDateIso < todayIso && status !== "done" && status !== "cancelled";
}
