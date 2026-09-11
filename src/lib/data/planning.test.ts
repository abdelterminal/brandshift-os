import { describe, expect, it } from "vitest";

import { hoursSince } from "./planning";

describe("hoursSince", () => {
  const now = new Date("2026-09-11T12:00:00Z");

  it("is zero for someone who just joined", () => {
    expect(hoursSince(now, now)).toBe(0);
  });

  it("counts whole hours elapsed", () => {
    const joinedAt = new Date("2026-09-09T12:00:00Z"); // 48h before `now`
    expect(hoursSince(joinedAt, now)).toBe(48);
  });

  it("is fractional for anything less than a whole hour", () => {
    const joinedAt = new Date("2026-09-11T11:30:00Z"); // 30 minutes before
    expect(hoursSince(joinedAt, now)).toBe(0.5);
  });
});
