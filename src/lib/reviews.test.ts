import { describe, expect, it } from "vitest";

import { canReview, isCurrentWeek, missedWeeks, weekRange, weekToReview } from "./reviews";

/**
 * The weeks that were skipped.
 *
 * The whole value of a reviews screen is telling you about those. A list of
 * the reviews you did hold is a diary; a list of the ones you did not is the
 * thing that gets the meeting back in the calendar -- so it has to be right in
 * both directions. Crying wolf about a week still in progress is how a screen
 * teaches people to ignore it.
 */

// Friday 4 September 2026. Its week starts Monday 31 August.
const TODAY = "2026-09-04";
const THIS_WEEK = "2026-08-31";
const LAST_WEEK = "2026-08-24";

describe("weekRange", () => {
  it("runs Monday to Sunday, inclusive", () => {
    expect(weekRange("2026-08-31")).toEqual({ start: "2026-08-31", end: "2026-09-06" });
  });
});

describe("isCurrentWeek", () => {
  it("knows the week we are living in", () => {
    expect(isCurrentWeek(THIS_WEEK, TODAY)).toBe(true);
    expect(isCurrentWeek(LAST_WEEK, TODAY)).toBe(false);
  });
});

describe("weekToReview", () => {
  it("offers the week just gone, not the one in progress", () => {
    // Reviewing a week with three days left in it produces a document that
    // was out of date before it was published.
    expect(weekToReview(TODAY)).toBe(LAST_WEEK);
  });

  it("works on a Monday, when the week just gone ended yesterday", () => {
    expect(weekToReview("2026-08-31")).toBe("2026-08-24");
  });
});

describe("canReview", () => {
  it("allows a week that has finished", () => {
    expect(canReview(LAST_WEEK, TODAY)).toBe(true);
  });

  it("refuses the current week and anything ahead of it", () => {
    expect(canReview(THIS_WEEK, TODAY)).toBe(false);
    expect(canReview("2026-09-07", TODAY)).toBe(false);
  });
});

describe("missedWeeks", () => {
  it("finds the gap between two reviews", () => {
    // Held on the 10th and the 24th; the 17th was skipped.
    expect(missedWeeks(["2026-08-10", "2026-08-24"], TODAY)).toEqual(["2026-08-17"]);
  });

  it("never counts the current week, which has not finished", () => {
    // No review for the week of the 31st, and that is not a problem yet.
    const missed = missedWeeks(["2026-08-24"], TODAY);
    expect(missed).not.toContain(THIS_WEEK);
  });

  it("counts last week once it is over", () => {
    expect(missedWeeks(["2026-08-10"], TODAY)).toEqual(["2026-08-24", "2026-08-17"]);
  });

  it("does not blame an organization for the time before it started", () => {
    // Reviews began in August. January was not skipped; it simply was not
    // doing this yet.
    const missed = missedWeeks(["2026-08-24"], TODAY);
    expect(missed).toEqual([]);
  });

  it("says nothing at all when no review has ever been held", () => {
    // Everything would be "missed", which is true and useless.
    expect(missedWeeks([], TODAY)).toEqual([]);
  });

  it("returns them newest first", () => {
    const missed = missedWeeks(["2026-07-06"], TODAY, 12);
    expect(missed[0]).toBe("2026-08-24");
    expect(missed[missed.length - 1]).toBe("2026-07-13");
  });

  it("stops at the lookback, however long the gap", () => {
    const missed = missedWeeks(["2020-01-06"], TODAY, 4);
    expect(missed).toHaveLength(4);
  });

  it("is empty when every week since the first has been reviewed", () => {
    expect(missedWeeks(["2026-08-17", "2026-08-24"], TODAY)).toEqual([]);
  });
});
