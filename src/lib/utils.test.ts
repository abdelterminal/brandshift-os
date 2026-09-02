import { describe, expect, it } from "vitest";

import { cn } from "./utils";

/**
 * Regression guard for a bug that shipped invisibly.
 *
 * tailwind-merge decides which group an unknown `text-*` utility belongs to by
 * inspecting the value. `text-label` and `text-caption` are not font sizes it
 * recognises, so it filed them as colours -- and then dropped the real colour
 * next to them as a conflict. Every primary button lost its white label and
 * inherited near-black text on red, which is unreadable and passes no test that
 * is not looking for it.
 */

describe("cn keeps our type scale and colours apart", () => {
  it.each([
    ["text-display-lg", "text-fg-default"],
    ["text-display", "text-fg-muted"],
    ["text-heading-lg", "text-fg-default"],
    ["text-heading", "text-accent-text"],
    ["text-body-lg", "text-fg-muted"],
    ["text-body", "text-fg-subtle"],
    ["text-label", "text-accent-fg"],
    ["text-caption", "text-blocked-text"],
  ])("keeps both %s and %s", (size, colour) => {
    const result = cn(size, colour);
    expect(result).toContain(size);
    expect(result).toContain(colour);
  });

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-body", "text-label")).toBe("text-label");
  });

  it("still lets a later colour replace an earlier one", () => {
    expect(cn("text-fg-muted", "text-fg-default")).toBe("text-fg-default");
  });
});

describe("cn understands our radii and shadows", () => {
  it("replaces a radius with a later radius", () => {
    expect(cn("rounded-control", "rounded-card")).toBe("rounded-card");
    expect(cn("rounded-card", "rounded-surface")).toBe("rounded-surface");
    expect(cn("rounded-surface", "rounded-pill")).toBe("rounded-pill");
  });

  it("replaces a shadow with a later shadow", () => {
    expect(cn("shadow-card", "shadow-overlay")).toBe("shadow-overlay");
  });

  it("does not confuse a radius with a background", () => {
    const result = cn("rounded-control", "bg-surface-raised");
    expect(result).toContain("rounded-control");
    expect(result).toContain("bg-surface-raised");
  });
});

describe("cn behaves like tailwind-merge elsewhere", () => {
  it("keeps the last of two conflicting paddings", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("keeps non-conflicting utilities", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center");
  });

  it("drops falsy values", () => {
    expect(cn("flex", false && "hidden", undefined, null)).toBe("flex");
  });
});
