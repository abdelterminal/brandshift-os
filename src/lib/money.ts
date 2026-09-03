/**
 * Money.
 *
 * Every amount in this app is an integer number of minor units -- cents -- from
 * the moment it is parsed to the moment it is formatted. Nothing in between
 * touches a float.
 *
 * This is not fussiness. `0.1 + 0.2` is `0.30000000000000004`, and an invoice
 * is a column of numbers added together and then multiplied by a tax rate. A
 * float that has been through that is a rounding error waiting for a customer
 * to find it, and "the total is a penny out" is the kind of bug that costs
 * more trust than it costs time.
 *
 * The database stores `numeric`, which is exact, and the driver hands it back
 * as a string. The string is parsed here, once, and never becomes a `number`
 * except as a count of cents.
 */

/** An integer number of minor units. Negative is allowed: a credit is money. */
export type Cents = number;

const AMOUNT = /^-?\d+(\.\d{1,2})?$/;

/**
 * Parse what a person typed.
 *
 * Accepts the separators people actually use -- `12 500`, `12,500`, `1 234,56`
 * -- and refuses everything else rather than storing a zero. A field that
 * silently reads "about forty thousand" as nothing is a field that loses money
 * quietly.
 */
export function parseMoney(input: string): Cents | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // A comma is a decimal separator in French and a thousands separator in
  // English. The last one wins as the decimal point only if it is followed by
  // one or two digits and there is no dot after it.
  let normalised = trimmed.replace(/\s/g, "");

  const lastComma = normalised.lastIndexOf(",");
  const lastDot = normalised.lastIndexOf(".");

  if (lastComma > lastDot && /,\d{1,2}$/.test(normalised)) {
    normalised = `${normalised.slice(0, lastComma).replace(/[.,]/g, "")}.${normalised.slice(lastComma + 1)}`;
  } else {
    normalised = normalised.replace(/,/g, "");
  }

  if (!AMOUNT.test(normalised)) return null;

  const negative = normalised.startsWith("-");
  const [whole, fraction = ""] = normalised.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : null;
}

/** What the database stores: an exact decimal string, never a float. */
export function toDecimalString(cents: Cents): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** What the driver returns, back into cents. Exact, because it is a decimal. */
export function fromDecimalString(value: string | null): Cents | null {
  return value === null ? null : parseMoney(value);
}

/**
 * A line's own total: quantity times unit price.
 *
 * Quantity carries three decimals, because agencies bill in fractions of a day
 * and `0.125` is a real number of them. It is held as thousandths for the same
 * reason money is held as cents, and the product is rounded once, at the end,
 * half away from zero -- the rule every invoice in Europe is written under.
 */
export function lineTotal(quantityThousandths: number, unitPrice: Cents): Cents {
  return roundHalfAwayFromZero((quantityThousandths * unitPrice) / 1000);
}

/**
 * Tax on an amount, at a rate in basis points.
 *
 * Basis points rather than a percentage, so 20% is `2000` and 5.5% -- a real
 * French rate -- is `550`, with no decimal anywhere in the arithmetic.
 */
export function taxOn(amount: Cents, rateBasisPoints: number): Cents {
  return roundHalfAwayFromZero((amount * rateBasisPoints) / 10_000);
}

/**
 * Round half away from zero.
 *
 * `Math.round` rounds half *up*, which sends -0.5 to 0 and makes a credit note
 * disagree with the invoice it reverses. Tax authorities specify away from
 * zero; so does this.
 */
export function roundHalfAwayFromZero(value: number): Cents {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function sum(amounts: Cents[]): Cents {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** Parse a quantity like `1.5` or `0,25` into thousandths. */
export function parseQuantity(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.split(".");
  const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(thousandths) && thousandths > 0 ? thousandths : null;
}

export function quantityToString(thousandths: number): string {
  const whole = Math.floor(thousandths / 1000);
  const fraction = String(thousandths % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/**
 * Totals for a document, computed from its lines.
 *
 * Tax is worked out per line and then added, not applied to the subtotal.
 * A document with lines at different rates -- design at 20%, print at 5.5% --
 * gives a different answer each way, and per line is the one that is correct.
 */
export type DocumentTotals = { subtotal: Cents; tax: Cents; total: Cents };

export function totalsFor(
  lines: Array<{ quantityThousandths: number; unitPrice: Cents; taxRateBasisPoints: number }>,
): DocumentTotals {
  let subtotal = 0;
  let tax = 0;

  for (const line of lines) {
    const net = lineTotal(line.quantityThousandths, line.unitPrice);
    subtotal += net;
    tax += taxOn(net, line.taxRateBasisPoints);
  }

  return { subtotal, tax, total: subtotal + tax };
}
