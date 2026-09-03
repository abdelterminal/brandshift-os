import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

/**
 * A slug is part of a URL people paste to each other, so the interesting cases
 * are the ones that would produce a URL nobody can use: an empty string, a
 * name that is entirely punctuation, an accented name mangled into nonsense.
 */
describe("slugify", () => {
  it("makes an ordinary name readable", () => {
    expect(slugify("Meridian rebrand", "MER")).toBe("meridian-rebrand");
    expect(slugify("Northwind e-commerce replatform", "NOR")).toBe(
      "northwind-e-commerce-replatform",
    );
  });

  it("keeps an accented letter rather than dropping it", () => {
    // Decomposed first, so the accent falls away and the letter stays. Without
    // the normalize step this is "caf-rebrand", which reads as a typo.
    expect(slugify("Café rebrand", "CAF")).toBe("cafe-rebrand");
    expect(slugify("Inès Ferreira", "INE")).toBe("ines-ferreira");
  });

  it("falls back rather than producing an empty URL", () => {
    expect(slugify("", "MER")).toBe("mer");
    expect(slugify("...", "MER")).toBe("mer");
    expect(slugify("   ", "MER")).toBe("mer");
    expect(slugify("你好", "MER")).toBe("mer");
  });

  it("never leaves a dangling separator, including after truncation", () => {
    const long = slugify(`${"a".repeat(47)} tail`, "X");
    expect(long.endsWith("-")).toBe(false);
    expect(long.length).toBeLessThanOrEqual(48);

    expect(slugify("--Meridian--", "MER")).toBe("meridian");
    expect(slugify("Q4 / 2026 — launch!", "Q4")).toBe("q4-2026-launch");
  });
});
