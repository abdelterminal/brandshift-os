import { describe, expect, it } from "vitest";

import { dueDateLabel, isOverdue } from "./due-date";

describe("dueDateLabel", () => {
  it("names today", () => {
    expect(dueDateLabel("2026-09-09", "2026-09-09")).toEqual({ kind: "today" });
  });

  it("counts forward inside the six-day window", () => {
    expect(dueDateLabel("2026-09-10", "2026-09-09")).toEqual({ kind: "in", days: 1 });
    expect(dueDateLabel("2026-09-15", "2026-09-09")).toEqual({ kind: "in", days: 6 });
  });

  it("counts backward inside the six-day window", () => {
    expect(dueDateLabel("2026-09-08", "2026-09-09")).toEqual({ kind: "overdueBy", days: 1 });
    expect(dueDateLabel("2026-09-03", "2026-09-09")).toEqual({ kind: "overdueBy", days: 6 });
  });

  it("falls back to the absolute date just past either edge", () => {
    expect(dueDateLabel("2026-09-16", "2026-09-09")).toEqual({ kind: "absolute" });
    expect(dueDateLabel("2026-09-02", "2026-09-09")).toEqual({ kind: "absolute" });
  });

  it("falls back far in either direction too", () => {
    expect(dueDateLabel("2027-01-01", "2026-09-09")).toEqual({ kind: "absolute" });
    expect(dueDateLabel("2025-01-01", "2026-09-09")).toEqual({ kind: "absolute" });
  });

  it("crosses a month boundary correctly", () => {
    expect(dueDateLabel("2026-10-01", "2026-09-28")).toEqual({ kind: "in", days: 3 });
  });
});

describe("isOverdue", () => {
  it("is true for an open task whose date has passed", () => {
    expect(isOverdue("2026-09-01", "2026-09-09", "todo")).toBe(true);
    expect(isOverdue("2026-09-01", "2026-09-09", "in_progress")).toBe(true);
    expect(isOverdue("2026-09-01", "2026-09-09", "blocked")).toBe(true);
  });

  it("is false once the task is done or cancelled, whatever the date", () => {
    expect(isOverdue("2026-09-01", "2026-09-09", "done")).toBe(false);
    expect(isOverdue("2026-09-01", "2026-09-09", "cancelled")).toBe(false);
  });

  it("is false for today or the future", () => {
    expect(isOverdue("2026-09-09", "2026-09-09", "todo")).toBe(false);
    expect(isOverdue("2026-09-10", "2026-09-09", "todo")).toBe(false);
  });

  it("is false with no due date", () => {
    expect(isOverdue(null, "2026-09-09", "todo")).toBe(false);
  });
});
