import { roundHalfAwayFromZero, toDecimalString, type Cents } from "./money";

/**
 * The arithmetic of a goal.
 *
 * Pure, and tested, for the same reason `money.ts` is: this is where a number
 * on a screen turns into a judgement about whether the company is doing well,
 * and a progress bar that is subtly wrong is worse than no progress bar. It
 * will be believed.
 *
 * Two rules hold everywhere below:
 *
 * 1. **Progress is measured from the start, not from zero.** Going from 40 to
 *    60 against a target of 100 is a third of the way, not 60%. Tools that
 *    forget this flatter their users, which is the one thing a goal-tracking
 *    screen must never do.
 * 2. **Nothing is inferred that a person did not record.** With no checkpoint
 *    there is no progress -- not zero, not "assumed on track". The screen says
 *    nobody has measured it, which is a true and useful thing to say.
 */

export type KeyResultUnit = "count" | "percent" | "currency" | "days";
export type Direction = "increase" | "decrease";

/**
 * The scale each unit is stored at, as a divisor from the integer to what a
 * person reads. All of these already exist in `money.ts`; they are named here
 * so the mapping from unit to scale lives in exactly one place.
 */
export const UNIT_SCALE: Record<KeyResultUnit, number> = {
  count: 1,
  percent: 100, // basis points
  currency: 100, // cents
  days: 1000, // thousandths
};

/**
 * How far along, as a fraction between 0 and 1.
 *
 * `null` when nobody has recorded a checkpoint: the caller renders "not
 * measured" rather than an empty bar, because those mean different things and
 * only one of them is a problem.
 *
 * Clamped at both ends. Beating a target is worth saying in words -- and the
 * raw figures are right there -- but a bar drawn at 140% of its own width is a
 * rendering bug rather than good news.
 */
export function progressFraction(
  startValue: number,
  targetValue: number,
  currentValue: number | null,
): number | null {
  if (currentValue === null) return null;

  const span = targetValue - startValue;

  // A target equal to the start is "hold this number". Either you are on it or
  // you are not; there is no fraction of the way to somewhere you already are.
  if (span === 0) return currentValue === targetValue ? 1 : 0;

  const fraction = (currentValue - startValue) / span;
  return Math.min(1, Math.max(0, fraction));
}

/** The same thing as a whole percent, for screens and for `aria-valuenow`. */
export function progressPercent(
  startValue: number,
  targetValue: number,
  currentValue: number | null,
): number | null {
  const fraction = progressFraction(startValue, targetValue, currentValue);
  return fraction === null ? null : roundHalfAwayFromZero(fraction * 100);
}

/**
 * Has it been met?
 *
 * Direction decides what "met" means, which is the reason `direction` is a
 * column at all: revenue going up and churn coming down are both success, and
 * a comparison that does not know which is which will congratulate you for the
 * wrong one.
 */
export function isMet(
  targetValue: number,
  currentValue: number | null,
  direction: Direction,
): boolean {
  if (currentValue === null) return false;
  return direction === "increase" ? currentValue >= targetValue : currentValue <= targetValue;
}

/**
 * How much of the period has gone.
 *
 * Inclusive of both ends, because a one-day period is one day long and not
 * zero. Before it starts this is 0; after it ends, 1.
 */
export function elapsedFraction(periodStart: Date, periodEnd: Date, today: Date): number {
  const day = 86_400_000;
  const total = Math.round((periodEnd.getTime() - periodStart.getTime()) / day) + 1;
  if (total <= 0) return 1;

  // The current day counts as under way, not as still to come. Counting only
  // whole days *since* the start would leave the last day of a quarter reading
  // as 99% elapsed, so a goal could never be judged against a period that had
  // actually finished.
  const gone = Math.round((today.getTime() - periodStart.getTime()) / day) + 1;
  return Math.min(1, Math.max(0, gone / total));
}

export type Health = "not_measured" | "on_track" | "at_risk" | "behind" | "done";

/**
 * On track, or not.
 *
 * The comparison is progress against elapsed time, which is the only honest
 * one available: a third of the way through the quarter with a third of the
 * number delivered is fine, and the same progress with a week to go is not.
 *
 * The bands are deliberately forgiving. Work does not arrive linearly -- a
 * campaign lands in one week and moves a quarter's number -- so a goal is only
 * called `behind` once it is a long way adrift. A screen that shouts every
 * Tuesday is a screen people stop reading, and then it cannot warn them about
 * the one that matters.
 */
export function health(progress: number | null, elapsed: number): Health {
  if (progress === null) return "not_measured";
  if (progress >= 1) return "done";

  // Nothing is late before it has started.
  if (elapsed <= 0) return "on_track";

  const shortfall = elapsed - progress;
  if (shortfall <= 0.15) return "on_track";
  if (shortfall <= 0.35) return "at_risk";
  return "behind";
}

/**
 * An objective's own progress: the mean of its key results.
 *
 * Unweighted, and that is a decision rather than an omission. Weights are a
 * number somebody invents in a meeting and never revisits, and they make the
 * headline figure impossible to check by eye. If one key result matters more
 * than the others, it deserves to be its own objective.
 *
 * Key results nobody has measured are left out of the mean rather than counted
 * as zero -- unmeasured is not the same as no progress, and treating it as
 * such would make an objective look like it is failing when the truth is that
 * nobody has looked.
 */
export function objectiveProgress(fractions: Array<number | null>): number | null {
  const measured = fractions.filter((value): value is number => value !== null);
  if (measured.length === 0) return null;

  return measured.reduce((total, value) => total + value, 0) / measured.length;
}

// ---------------------------------------------------------------------------
// Reading and writing the values people type
// ---------------------------------------------------------------------------

/**
 * Parse what somebody typed into the unit's integer scale.
 *
 * `null` rather than zero for anything that is not a number, exactly as
 * `parseMoney` does: a field that reads "about eighty percent" as nothing is a
 * field that silently sets a target of zero and reports it as met.
 *
 * Negatives are allowed. A key result can be a number that should fall, and
 * some of them -- margin, say -- can legitimately be below zero.
 */
export function parseValue(input: string, unit: KeyResultUnit): number | null {
  let normalised = input.trim().replace(/\s/g, "");
  if (normalised === "") return null;

  // Trailing `%` on a percentage is what people type; it is not extra meaning.
  if (unit === "percent") normalised = normalised.replace(/%$/, "");

  const scale = UNIT_SCALE[unit];
  const decimals = String(scale).length - 1;

  // A comma is a decimal separator in French and a thousands separator in
  // English -- the same rule `parseMoney` follows, for the same input. How
  // many digits may follow it depends on the unit, and that has to be settled
  // *before* the comma is read: a `count` has no decimals at all, so a comma
  // in one can only ever be a thousands separator, and `1,200` projects is
  // twelve hundred of them rather than one and a fifth.
  const lastComma = normalised.lastIndexOf(",");
  const lastDot = normalised.lastIndexOf(".");
  const commaIsDecimal =
    decimals > 0 && lastComma > lastDot && new RegExp(`,\\d{1,${decimals}}$`).test(normalised);

  normalised = commaIsDecimal
    ? `${normalised.slice(0, lastComma).replace(/[.,]/g, "")}.${normalised.slice(lastComma + 1)}`
    : normalised.replace(/,/g, "");

  const pattern = decimals === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+(\\.\\d{1,${decimals}})?$`);

  if (!pattern.test(normalised)) return null;

  const negative = normalised.startsWith("-");
  const [whole, fraction = ""] = normalised.replace("-", "").split(".");
  const scaled =
    Number(whole) * scale + (decimals === 0 ? 0 : Number(fraction.padEnd(decimals, "0")));

  if (!Number.isSafeInteger(scaled)) return null;
  return negative ? -scaled : scaled;
}

/**
 * The stored integer back into a decimal string, for an input's value.
 *
 * Not for display -- that goes through `next-intl`'s formatter so a French
 * reader gets a comma and a Moroccan dirham gets its own symbol. This is the
 * round trip that puts a stored number back into a form field.
 */
export function valueToInput(value: number, unit: KeyResultUnit): string {
  if (unit === "count") return String(value);
  if (unit === "currency") return toDecimalString(value as Cents);

  const scale = UNIT_SCALE[unit];
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / scale);
  const fraction = String(absolute % scale)
    .padStart(String(scale).length - 1, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** The stored integer as the plain number a formatter wants. */
export function valueToNumber(value: number, unit: KeyResultUnit): number {
  return value / UNIT_SCALE[unit];
}
