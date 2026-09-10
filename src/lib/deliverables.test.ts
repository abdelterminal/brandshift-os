import { describe, expect, it } from "vitest";

import {
  DELIVERABLE_FLOW,
  compareByFlow,
  isDeliverableOpen,
  nextStatus,
  prevStatus,
} from "./deliverables";

describe("the deliverable flow", () => {
  it("steps forward along the line and stops at the end", () => {
    expect(nextStatus("producing")).toBe("internal_review");
    expect(nextStatus("with_client")).toBe("revising");
    expect(nextStatus("revising")).toBe("published");
    expect(nextStatus("published")).toBeNull();
  });

  it("steps back and stops at the start", () => {
    expect(prevStatus("internal_review")).toBe("producing");
    expect(prevStatus("published")).toBe("revising");
    expect(prevStatus("producing")).toBeNull();
  });

  it("gives cancelled no next and no previous", () => {
    expect(nextStatus("cancelled")).toBeNull();
    expect(prevStatus("cancelled")).toBeNull();
  });

  it("knows which states are still open", () => {
    for (const status of DELIVERABLE_FLOW.slice(0, 4)) {
      expect(isDeliverableOpen(status)).toBe(true);
    }
    expect(isDeliverableOpen("published")).toBe(false);
    expect(isDeliverableOpen("cancelled")).toBe(false);
  });

  it("orders by position on the line, then due date, then title", () => {
    const rows = [
      { status: "published" as const, dueDate: null, title: "Z" },
      { status: "producing" as const, dueDate: "2026-03-01", title: "B" },
      { status: "producing" as const, dueDate: "2026-02-01", title: "A" },
      { status: "cancelled" as const, dueDate: null, title: "C" },
    ];
    expect(rows.slice().sort(compareByFlow).map((r) => r.title)).toEqual(["A", "B", "Z", "C"]);
  });
});
