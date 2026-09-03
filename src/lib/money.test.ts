import { describe, expect, it } from "vitest";

import {
  fromDecimalString,
  lineTotal,
  parseMoney,
  parseQuantity,
  quantityToString,
  roundHalfAwayFromZero,
  sum,
  taxOn,
  toDecimalString,
  totalsFor,
} from "./money";

/**
 * The arithmetic behind every invoice.
 *
 * These are the tests worth having in the whole codebase: a balance being half
 * a day out is embarrassing, and a total being a penny out is the kind of bug
 * that costs more trust than it costs time.
 */

describe("parseMoney", () => {
  it("takes what people actually type", () => {
    expect(parseMoney("12500")).toBe(1_250_000);
    expect(parseMoney("12 500")).toBe(1_250_000);
    expect(parseMoney("12,500")).toBe(1_250_000);
    expect(parseMoney("12500.50")).toBe(1_250_050);
    expect(parseMoney("0.05")).toBe(5);
    expect(parseMoney("0.5")).toBe(50);
  });

  it("reads a comma as a decimal point when that is what it is", () => {
    // French: "1 234,56" is one thousand two hundred and thirty-four euros.
    expect(parseMoney("1 234,56")).toBe(123_456);
    expect(parseMoney("0,99")).toBe(99);
    // English: "1,234.56" is the same amount written the other way.
    expect(parseMoney("1,234.56")).toBe(123_456);
    // And "1,234" is one thousand two hundred and thirty-four, not 1.234.
    expect(parseMoney("1,234")).toBe(123_400);
  });

  it("refuses anything that is not an amount, rather than reading it as zero", () => {
    for (const bad of [
      "",
      "   ",
      "about forty thousand",
      "12.345",
      "1e5",
      "--5",
      "12.5.5",
      "€50",
    ]) {
      expect(parseMoney(bad), bad).toBeNull();
    }
  });

  it("handles a credit", () => {
    expect(parseMoney("-250.00")).toBe(-25_000);
  });
});

describe("decimal strings", () => {
  it("round-trips through the shape the database stores", () => {
    for (const cents of [0, 5, 99, 100, 123_456, -25_000, 999_999_99]) {
      expect(fromDecimalString(toDecimalString(cents))).toBe(cents);
    }
  });

  it("always writes two decimal places", () => {
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(50)).toBe("0.50");
    expect(toDecimalString(100)).toBe("1.00");
    expect(toDecimalString(-2550)).toBe("-25.50");
  });
});

describe("rounding", () => {
  it("goes away from zero on a half, in both directions", () => {
    // `Math.round` sends -0.5 to -0, which makes a credit note disagree with
    // the invoice it reverses.
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
  });
});

describe("lines", () => {
  it("multiplies a fractional quantity exactly", () => {
    // 1.5 days at €800 is €1,200 -- not €1,199.99.
    expect(lineTotal(1_500, 80_000)).toBe(120_000);
    // An eighth of a day, which agencies really do bill.
    expect(lineTotal(125, 80_000)).toBe(10_000);
  });

  it("rounds a line once, at the end", () => {
    // 3 × 0.335 = 1.005, which is a penny either way if you round too early.
    expect(lineTotal(3_000, 34)).toBe(102);
  });

  it("survives the float that started all of this", () => {
    // 0.1 + 0.2 in cents is 30, and stays 30.
    expect(sum([10, 20])).toBe(30);
    expect(sum([parseMoney("0.10")!, parseMoney("0.20")!])).toBe(30);
  });
});

describe("tax", () => {
  it("works in basis points, so a real rate has no decimals in it", () => {
    // 20% of €100.
    expect(taxOn(10_000, 2_000)).toBe(2_000);
    // 5.5%, a real French rate, of €100.
    expect(taxOn(10_000, 550)).toBe(550);
    // 20% of €0.99 is €0.198, which rounds to €0.20.
    expect(taxOn(99, 2_000)).toBe(20);
  });

  it("is zero when the rate is zero", () => {
    expect(taxOn(123_456, 0)).toBe(0);
  });
});

describe("totalsFor", () => {
  it("adds tax per line, not to the subtotal", () => {
    // Design at 20% and print at 5.5% give different answers if the tax is
    // applied to the total instead, and per line is the correct one.
    const totals = totalsFor([
      { quantityThousandths: 1_000, unitPrice: 100_000, taxRateBasisPoints: 2_000 },
      { quantityThousandths: 1_000, unitPrice: 50_000, taxRateBasisPoints: 550 },
    ]);

    expect(totals.subtotal).toBe(150_000);
    expect(totals.tax).toBe(20_000 + 2_750);
    expect(totals.total).toBe(172_750);
  });

  it("is zero for a document with no lines", () => {
    expect(totalsFor([])).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });

  it("adds up a long column without drifting", () => {
    // A hundred lines at €0.07 plus 20% is exactly €7.00 net and €1.40 tax.
    const lines = Array.from({ length: 100 }, () => ({
      quantityThousandths: 1_000,
      unitPrice: 7,
      taxRateBasisPoints: 2_000,
    }));

    const totals = totalsFor(lines);
    expect(totals.subtotal).toBe(700);
    // Each line's tax rounds to 1 cent, so a hundred of them is 100 -- which
    // is *not* 20% of 700. That is correct: tax is per line, and an invoice
    // has to add up line by line.
    expect(totals.tax).toBe(100);
    expect(totals.total).toBe(800);
  });
});

describe("quantities", () => {
  it("takes fractions of a day", () => {
    expect(parseQuantity("1")).toBe(1_000);
    expect(parseQuantity("1.5")).toBe(1_500);
    expect(parseQuantity("0,25")).toBe(250);
    expect(parseQuantity("0.125")).toBe(125);
  });

  it("refuses nonsense and zero", () => {
    for (const bad of ["", "0", "-1", "1.2345", "half a day"]) {
      expect(parseQuantity(bad), bad).toBeNull();
    }
  });

  it("renders without trailing zeroes", () => {
    expect(quantityToString(1_000)).toBe("1");
    expect(quantityToString(1_500)).toBe("1.5");
    expect(quantityToString(125)).toBe("0.125");
  });
});
