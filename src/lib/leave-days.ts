import { addDays } from "./calendar-dates";

/**
 * How much a stretch of time off actually costs.
 *
 * A pure function over plain `YYYY-MM-DD` strings, in its own module for the
 * same reason `slugify` and the calendar arithmetic are: it touches no database
 * and no session, and it is the piece most worth testing -- a balance that is
 * wrong by half a day is a balance nobody trusts again.
 *
 * Weekends are free. Public holidays are not modelled, so a week off over
 * Christmas costs five days here and four in reality; that is recorded in
 * `KNOWN-GAPS.md` rather than approximated with a hardcoded list of somebody
 * else's national holidays.
 */

/** Saturday and Sunday. Everything else is a working day. */
export function isWeekend(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Every calendar day in an inclusive range, in order. */
export function eachDay(startDate: string, endDate: string): string[] {
  if (endDate < startDate) return [];

  const days: string[] = [];
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    days.push(day);
    // A range someone typed by hand can be nonsense; a year is well past any
    // leave request and stops a bad one becoming an infinite loop.
    if (days.length > 366) break;
  }
  return days;
}

/**
 * Working days in an inclusive range.
 *
 * `halfDay` only applies to a single-day request. Half days at both ends of a
 * range is a combinatorial mess for a case that is nearly always "I want the
 * afternoon off", and a form with four ways to say that is a form people get
 * wrong.
 */
export function workingDays(startDate: string, endDate: string, halfDay = false): number {
  const days = eachDay(startDate, endDate).filter((day) => !isWeekend(day));
  if (days.length === 0) return 0;
  if (halfDay && startDate === endDate) return 0.5;
  return days.length;
}

/** A range is usable if it is the right way round and not absurdly long. */
export function isValidRange(startDate: string, endDate: string): boolean {
  const shaped = /^\d{4}-\d{2}-\d{2}$/;
  if (!shaped.test(startDate) || !shaped.test(endDate)) return false;
  if (Number.isNaN(Date.parse(`${startDate}T00:00:00Z`))) return false;
  if (Number.isNaN(Date.parse(`${endDate}T00:00:00Z`))) return false;
  if (endDate < startDate) return false;

  // A year is longer than any leave anybody books through a form like this.
  return eachDay(startDate, endDate).length <= 366;
}

/** Whether two inclusive ranges share a day. Used to spot double bookings. */
export function overlaps(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
