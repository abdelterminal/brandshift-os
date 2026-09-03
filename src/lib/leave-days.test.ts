import { describe, expect, it } from "vitest";

import { eachDay, isValidRange, isWeekend, overlaps, workingDays } from "./leave-days";

/**
 * A balance that is wrong by half a day is a balance nobody trusts again, so
 * the counting is checked at every edge it has: weekends, single days, ranges
 * that start or end on a Saturday, and ranges that are nonsense.
 */

describe("isWeekend", () => {
  it("knows the weekend", () => {
    // 2026-09-05 is a Saturday, 2026-09-06 a Sunday.
    expect(isWeekend("2026-09-05")).toBe(true);
    expect(isWeekend("2026-09-06")).toBe(true);
    expect(isWeekend("2026-09-04")).toBe(false);
    expect(isWeekend("2026-09-07")).toBe(false);
  });
});

describe("workingDays", () => {
  it("counts a single working day as one", () => {
    expect(workingDays("2026-09-03", "2026-09-03")).toBe(1);
  });

  it("counts half a day only when the request is one day long", () => {
    expect(workingDays("2026-09-03", "2026-09-03", true)).toBe(0.5);
    // Half of a week is not a thing this form can express, so the flag is
    // ignored rather than quietly halving five days.
    expect(workingDays("2026-09-07", "2026-09-11", true)).toBe(5);
  });

  it("skips the weekend inside a range", () => {
    // Thursday to the following Wednesday: Thu Fri | Sat Sun | Mon Tue Wed.
    expect(workingDays("2026-09-03", "2026-09-09")).toBe(5);
  });

  it("costs nothing when it is all weekend", () => {
    expect(workingDays("2026-09-05", "2026-09-06")).toBe(0);
    expect(workingDays("2026-09-05", "2026-09-05", true)).toBe(0);
  });

  it("does not count the weekend at either end", () => {
    // Saturday to Sunday-week: only the five weekdays between them count.
    expect(workingDays("2026-09-05", "2026-09-13")).toBe(5);
  });

  it("counts a fortnight as ten", () => {
    expect(workingDays("2026-09-07", "2026-09-18")).toBe(10);
  });
});

describe("eachDay", () => {
  it("includes both ends", () => {
    expect(eachDay("2026-09-03", "2026-09-05")).toEqual(["2026-09-03", "2026-09-04", "2026-09-05"]);
  });

  it("is empty when the range is backwards", () => {
    expect(eachDay("2026-09-05", "2026-09-03")).toEqual([]);
  });

  it("crosses a month and a year", () => {
    expect(eachDay("2026-12-31", "2027-01-01")).toEqual(["2026-12-31", "2027-01-01"]);
  });
});

describe("isValidRange", () => {
  it("accepts an ordinary range", () => {
    expect(isValidRange("2026-09-03", "2026-09-10")).toBe(true);
    expect(isValidRange("2026-09-03", "2026-09-03")).toBe(true);
  });

  it("refuses a backwards range and anything unshaped", () => {
    expect(isValidRange("2026-09-10", "2026-09-03")).toBe(false);
    expect(isValidRange("", "2026-09-03")).toBe(false);
    expect(isValidRange("03/09/2026", "2026-09-03")).toBe(false);
    expect(isValidRange("2026-13-40", "2026-13-41")).toBe(false);
  });

  it("refuses a range longer than a year", () => {
    expect(isValidRange("2026-01-01", "2028-01-01")).toBe(false);
  });
});

describe("overlaps", () => {
  it("spots a double booking, including a single shared day", () => {
    const week = { startDate: "2026-09-07", endDate: "2026-09-11" };

    expect(overlaps(week, { startDate: "2026-09-09", endDate: "2026-09-09" })).toBe(true);
    expect(overlaps(week, { startDate: "2026-09-11", endDate: "2026-09-15" })).toBe(true);
    expect(overlaps(week, { startDate: "2026-09-01", endDate: "2026-09-07" })).toBe(true);

    expect(overlaps(week, { startDate: "2026-09-14", endDate: "2026-09-18" })).toBe(false);
    expect(overlaps(week, { startDate: "2026-09-01", endDate: "2026-09-04" })).toBe(false);
  });
});
