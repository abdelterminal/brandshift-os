import { describe, expect, it } from "vitest";

import { compareByUrgency, needsAttention, reviewDueOn, reviewState } from "./sops";

/**
 * When a procedure goes stale.
 *
 * Worth testing hard because this decides what the screen shouts about, and a
 * review reminder that is wrong in either direction kills the feature: too
 * eager and people learn to ignore it, too slack and the library fills up with
 * instructions nobody follows any more.
 */

describe("reviewDueOn", () => {
  it("is the last review plus the interval", () => {
    expect(reviewDueOn("2026-01-01", 180)).toBe("2026-06-30");
    expect(reviewDueOn("2026-01-01", 30)).toBe("2026-01-31");
  });

  it("is null when nobody has ever reviewed it", () => {
    // Not a date in the past: "never reviewed" is its own state, and forcing
    // it into a due date would lose the distinction the screen depends on.
    expect(reviewDueOn(null, 180)).toBeNull();
  });

  it("refuses a zero or negative interval rather than being due forever", () => {
    // An interval of nought would put the due date on the review itself, so
    // every procedure would be permanently overdue the moment it was read.
    expect(reviewDueOn("2026-01-01", 0)).toBe("2026-01-02");
    expect(reviewDueOn("2026-01-01", -5)).toBe("2026-01-02");
  });
});

describe("reviewState", () => {
  const TODAY = "2026-09-04";

  it("says never when it has never been reviewed", () => {
    expect(reviewState(null, 180, TODAY)).toBe("never");
  });

  it("is current when the review still has a while to run", () => {
    // Reviewed a fortnight ago on a six-month cycle.
    expect(reviewState("2026-08-21", 180, TODAY)).toBe("current");
  });

  it("warns before the date rather than on it", () => {
    // Due in a fortnight: worth knowing now, not the morning it expires.
    expect(reviewState("2026-03-24", 180, TODAY)).toBe("due_soon");
  });

  it("is overdue on the day it falls due, not the day after", () => {
    // Exactly 180 days before today.
    expect(reviewState("2026-03-08", 180, TODAY)).toBe("overdue");
  });

  it("is overdue long after", () => {
    expect(reviewState("2024-01-01", 180, TODAY)).toBe("overdue");
  });
});

describe("needsAttention", () => {
  it("covers the two states that are actually a problem", () => {
    expect(needsAttention("overdue")).toBe(true);
    expect(needsAttention("never")).toBe(true);
    // Due soon is worth showing, not worth shouting about.
    expect(needsAttention("due_soon")).toBe(false);
    expect(needsAttention("current")).toBe(false);
  });
});

describe("compareByUrgency", () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

  const make = (
    state: Parameters<typeof needsAttention>[0],
    lastReviewedOn: string | null,
    createdAt: string,
    title = "x",
  ) => ({ state, lastReviewedOn, createdAt: at(createdAt), title });

  it("puts overdue above never-reviewed", () => {
    // Both are problems; an out-of-date procedure is the one actively giving
    // wrong instructions with the authority of having been signed off.
    const rows = [
      make("never", null, "2026-08-01"),
      make("overdue", "2024-01-01", "2023-01-01"),
    ].sort(compareByUrgency);

    expect(rows[0].state).toBe("overdue");
  });

  it("puts the longest untouched first within a state", () => {
    const rows = [
      make("overdue", "2025-06-01", "2024-01-01", "newer"),
      make("overdue", "2024-02-01", "2023-01-01", "older"),
    ].sort(compareByUrgency);

    expect(rows[0].title).toBe("older");
  });

  it("ranks a never-reviewed procedure by when it was written", () => {
    // The last time anybody looked at the words is the day they were typed.
    const rows = [
      make("never", null, "2026-08-01", "recent"),
      make("never", null, "2024-01-01", "ancient"),
    ].sort(compareByUrgency);

    expect(rows[0].title).toBe("ancient");
  });

  it("falls back to the title, so two runs never disagree", () => {
    const rows = [
      make("current", "2026-08-01", "2026-01-01", "beta"),
      make("current", "2026-08-01", "2026-01-01", "alpha"),
    ].sort(compareByUrgency);

    expect(rows.map((row) => row.title)).toEqual(["alpha", "beta"]);
  });

  it("sorts a whole library worst first", () => {
    const rows = [
      make("current", "2026-08-21", "2026-01-01", "fine"),
      make("overdue", "2024-01-01", "2023-01-01", "ancient and stale"),
      make("due_soon", "2026-03-24", "2026-01-01", "coming up"),
      make("never", null, "2025-01-01", "never looked at"),
    ].sort(compareByUrgency);

    expect(rows.map((row) => row.title)).toEqual([
      "ancient and stale",
      "never looked at",
      "coming up",
      "fine",
    ]);
  });
});
