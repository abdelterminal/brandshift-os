import { describe, expect, it } from "vitest";

import {
  elapsedFraction,
  health,
  isMet,
  objectiveProgress,
  parseValue,
  progressFraction,
  progressPercent,
  valueToInput,
  valueToNumber,
} from "./objectives";

/**
 * The arithmetic behind every judgement the objectives screen makes.
 *
 * Worth testing as hard as the invoice arithmetic, and for a related reason: a
 * total that is a penny out gets found and argued about, where a progress bar
 * that is quietly wrong gets believed and acted on.
 */

describe("progressFraction", () => {
  it("measures from the start, not from zero", () => {
    // The mistake that makes every OKR tool flatter its user: 60 against a
    // target of 100 having started at 40 is a third of the way, not 60%.
    expect(progressFraction(40, 100, 60)).toBeCloseTo(1 / 3);
    expect(progressPercent(40, 100, 60)).toBe(33);
  });

  it("handles a number that is supposed to come down", () => {
    // Churn from 20% to a target of 5%, currently 11%: 60% of the way.
    expect(progressFraction(2_000, 500, 1_100)).toBeCloseTo(0.6);
  });

  it("says nothing rather than zero when nobody has measured", () => {
    // "Not measured" and "no progress" are different facts, and only one of
    // them is somebody's fault.
    expect(progressFraction(0, 100, null)).toBeNull();
    expect(progressPercent(0, 100, null)).toBeNull();
  });

  it("clamps, so a bar is never drawn wider than itself", () => {
    expect(progressFraction(0, 100, 140)).toBe(1);
    expect(progressFraction(0, 100, -50)).toBe(0);
  });

  it("treats an unchanged target as hold-this-number", () => {
    expect(progressFraction(50, 50, 50)).toBe(1);
    expect(progressFraction(50, 50, 49)).toBe(0);
  });
});

describe("isMet", () => {
  it("knows which way is good", () => {
    // The reason `direction` is a column: both of these are success.
    expect(isMet(100, 100, "increase")).toBe(true);
    expect(isMet(100, 120, "increase")).toBe(true);
    expect(isMet(100, 99, "increase")).toBe(false);

    expect(isMet(500, 400, "decrease")).toBe(true);
    expect(isMet(500, 600, "decrease")).toBe(false);
  });

  it("is not met when it has not been measured", () => {
    expect(isMet(100, null, "increase")).toBe(false);
  });
});

describe("elapsedFraction", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("counts both ends of the period", () => {
    // A one-day period is one day long, not zero.
    expect(elapsedFraction(d("2026-01-01"), d("2026-01-01"), d("2026-01-01"))).toBe(1);
  });

  it("is zero before it starts and one after it ends", () => {
    expect(elapsedFraction(d("2026-04-01"), d("2026-06-30"), d("2026-03-01"))).toBe(0);
    expect(elapsedFraction(d("2026-04-01"), d("2026-06-30"), d("2026-12-01"))).toBe(1);
  });

  it("is about half way through the middle of a quarter", () => {
    const fraction = elapsedFraction(d("2026-01-01"), d("2026-03-31"), d("2026-02-14"));
    expect(fraction).toBeGreaterThan(0.45);
    expect(fraction).toBeLessThan(0.55);
  });
});

describe("health", () => {
  it("says nothing before anyone has measured", () => {
    expect(health(null, 0.5)).toBe("not_measured");
  });

  it("is done once the target is reached, however early", () => {
    expect(health(1, 0.2)).toBe("done");
  });

  it("is on track when progress roughly keeps up with the calendar", () => {
    expect(health(0.5, 0.5)).toBe("on_track");
    // Ahead of the calendar.
    expect(health(0.8, 0.4)).toBe("on_track");
    // Slightly behind, which is normal and not worth a warning.
    expect(health(0.4, 0.5)).toBe("on_track");
  });

  it("warns before it shouts", () => {
    // A fifth adrift: worth a look.
    expect(health(0.3, 0.5)).toBe("at_risk");
    // Half the quarter gone and nothing delivered: worth shouting.
    expect(health(0.05, 0.6)).toBe("behind");
  });

  it("calls nothing late before the period has started", () => {
    expect(health(0, 0)).toBe("on_track");
  });

  it("is forgiving on purpose", () => {
    // Work does not arrive linearly -- a campaign lands in one week and moves
    // the whole number. A screen that shouts every Tuesday stops being read,
    // and then it cannot warn about the one that matters.
    expect(health(0.4, 0.5)).toBe("on_track");
  });
});

describe("objectiveProgress", () => {
  it("is the mean of what has been measured", () => {
    expect(objectiveProgress([0.5, 1])).toBe(0.75);
  });

  it("leaves unmeasured key results out rather than counting them as zero", () => {
    // Counting them as zero would make an objective look like it is failing
    // when the truth is that nobody has looked.
    expect(objectiveProgress([0.5, null, 1])).toBe(0.75);
  });

  it("is null when nothing at all has been measured", () => {
    expect(objectiveProgress([null, null])).toBeNull();
    expect(objectiveProgress([])).toBeNull();
  });
});

describe("parseValue", () => {
  it("takes a plain count", () => {
    expect(parseValue("12", "count")).toBe(12);
    expect(parseValue("1,200", "count")).toBe(1200);
    expect(parseValue("1 200", "count")).toBe(1200);
  });

  it("refuses a fractional count, because half a project is not a thing", () => {
    expect(parseValue("12.5", "count")).toBeNull();
  });

  it("stores a percentage as basis points, with or without the sign", () => {
    expect(parseValue("85", "percent")).toBe(8_500);
    expect(parseValue("85%", "percent")).toBe(8_500);
    expect(parseValue("5.5", "percent")).toBe(550);
    expect(parseValue("5,5", "percent")).toBe(550);
  });

  it("stores money as cents, the way the rest of the app does", () => {
    expect(parseValue("250000", "currency")).toBe(25_000_000);
    expect(parseValue("1 234,56", "currency")).toBe(123_456);
    expect(parseValue("1,234.56", "currency")).toBe(123_456);
  });

  it("stores days as thousandths", () => {
    expect(parseValue("12.5", "days")).toBe(12_500);
    expect(parseValue("0.125", "days")).toBe(125);
  });

  it("refuses anything that is not a number rather than reading it as zero", () => {
    // A target of zero that reports itself as met is the worst possible
    // failure for this screen.
    for (const bad of ["", "   ", "about eighty percent", "1e5", "--5", "12.5.5"]) {
      expect(parseValue(bad, "percent"), bad).toBeNull();
    }
  });

  it("allows a negative, because some real numbers are", () => {
    expect(parseValue("-5.5", "percent")).toBe(-550);
  });
});

describe("round trips", () => {
  it("puts a stored value back into a form field unchanged", () => {
    const cases: Array<[string, Parameters<typeof parseValue>[1]]> = [
      ["12", "count"],
      ["85", "percent"],
      ["5.5", "percent"],
      ["250000.00", "currency"],
      ["12.5", "days"],
    ];

    for (const [input, unit] of cases) {
      const stored = parseValue(input, unit);
      expect(stored, `${input} ${unit}`).not.toBeNull();
      expect(parseValue(valueToInput(stored!, unit), unit), `${input} ${unit}`).toBe(stored);
    }
  });

  it("hands a formatter the number a human means", () => {
    expect(valueToNumber(8_500, "percent")).toBe(85);
    expect(valueToNumber(25_000_000, "currency")).toBe(250_000);
    expect(valueToNumber(12_500, "days")).toBe(12.5);
    expect(valueToNumber(12, "count")).toBe(12);
  });
});
