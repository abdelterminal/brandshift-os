/**
 * Calendar arithmetic.
 *
 * Plain functions over plain strings, in their own module for the same reason
 * `slugify` is: they touch no database and no session, the month grid needs
 * them on the client, and a pure function inside a `server-only` module is a
 * pure function nothing can test.
 *
 * Dates are `YYYY-MM-DD` throughout. A calendar day is a label, not an
 * instant, and treating it as one is what stops a deadline drifting a day
 * either side depending on who happens to be looking at it.
 */

/**
 * A calendar day, in the organization's timezone.
 *
 * Everything on this screen is grouped by the day it falls on *here*, not by
 * the day it falls on in UTC -- a 9pm Paris meeting in winter is not tomorrow,
 * and a calendar that says it is loses people an evening.
 */
export function dayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Midnight, in the organization's timezone, as an instant. */
export function startOfDay(day: string, timeZone: string): Date {
  // Built by measuring the zone's offset at that moment rather than assuming
  // one: `Europe/Paris` is +01:00 in January and +02:00 in July, and a fixed
  // offset puts every summer meeting an hour out.
  const naive = new Date(`${day}T00:00:00Z`);
  const offset = zoneOffsetMs(naive, timeZone);
  return new Date(naive.getTime() - offset);
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // `Intl` renders midnight as hour 24 in some locales rather than 0.
  const hour = read("hour") % 24;

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour,
    read("minute"),
    read("second"),
  );

  return asUtc - at.getTime();
}

/** `2026-09-03` plus n days, staying a plain calendar date throughout. */
export function addDays(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The Monday of the week a day falls in. Weeks start on Monday here. */
export function startOfWeek(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  const weekday = (at.getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: string): string {
  const at = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() + 1);
  return at.toISOString().slice(0, 10);
}

/**
 * A wall-clock time in the organization's zone, as an instant.
 *
 * `<input type="datetime-local">` gives `2026-09-03T14:30` with no zone
 * attached. Everyone booking a meeting here means the organization's clock,
 * not the browser's -- somebody on holiday in Lisbon who types 14:30 means
 * 14:30 in the studio. Reading it as local browser time would put the meeting
 * an hour out for exactly the person least able to notice.
 */
export function instantFromLocal(local: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;

  const naive = new Date(`${local.length === 16 ? `${local}:00` : local}Z`);
  if (Number.isNaN(naive.getTime())) return null;

  return new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
}

/** The other direction, for putting an existing meeting back into the form. */
export function localFromInstant(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  // `Intl` renders midnight as 24 in some locales rather than 00.
  const hour = String(Number(read("hour")) % 24).padStart(2, "0");

  return `${read("year")}-${read("month")}-${read("day")}T${hour}:${read("minute")}`;
}
