import { describe, expect, it } from "vitest";

import { NUDGE_COOLDOWN_MS, nudgeReady } from "./task-links";

describe("nudgeReady", () => {
  const now = new Date("2026-09-10T12:00:00Z");

  it("is ready when it has never been nudged", () => {
    expect(nudgeReady(null, now)).toBe(true);
  });

  it("is not ready inside the cooldown", () => {
    const recent = new Date(now.getTime() - NUDGE_COOLDOWN_MS + 60_000);
    expect(nudgeReady(recent, now)).toBe(false);
  });

  it("is ready once the cooldown has passed", () => {
    const old = new Date(now.getTime() - NUDGE_COOLDOWN_MS - 1);
    expect(nudgeReady(old, now)).toBe(true);
  });
});
