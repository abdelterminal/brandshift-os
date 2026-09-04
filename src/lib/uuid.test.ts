import { describe, expect, it } from "vitest";

import { isUuid } from "./uuid";

/**
 * The guard that turns a 500 into a 404.
 *
 * What matters is the two directions of wrongness: it must not reject a real
 * id (which would make a live page disappear), and it must not accept anything
 * Postgres would refuse (which puts the 500 back).
 */
describe("isUuid", () => {
  it("accepts what the database actually stores", () => {
    // `defaultRandom()` -- version 4.
    expect(isUuid("5f0eceaa-746e-4dd3-a504-d314815460ea")).toBe(true);
    // The Mongo migration's deterministic ids -- version 5.
    expect(isUuid("2ed3b0e7-6c39-5c1f-9d0a-8b1e5f2a7c44")).toBe(true);
  });

  it("does not care about the version nibble", () => {
    // A version check would reject half of a migrated database. Postgres
    // accepts any of these, so this must too.
    for (const version of "12345678") {
      expect(isUuid(`5f0eceaa-746e-${version}dd3-a504-d314815460ea`)).toBe(true);
    }
  });

  it("is case-insensitive, because Postgres is", () => {
    expect(isUuid("5F0ECEAA-746E-4DD3-A504-D314815460EA")).toBe(true);
  });

  it("rejects the path segments that caused the 500", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("print")).toBe(false);
    expect(isUuid("")).toBe(false);
  });

  it("rejects near misses", () => {
    const good = "5f0eceaa-746e-4dd3-a504-d314815460ea";
    expect(isUuid(good.replace(/-/g, ""))).toBe(false); // no dashes
    expect(isUuid(good + "a")).toBe(false); // too long
    expect(isUuid(good.slice(0, -1))).toBe(false); // too short
    expect(isUuid(good.replace("a", "g"))).toBe(false); // not hex
    expect(isUuid(` ${good} `)).toBe(false); // padded
    expect(isUuid(`${good}\n`)).toBe(false); // a trailing newline still anchors
  });

  it("rejects an injection attempt outright", () => {
    expect(isUuid("' OR 1=1 --")).toBe(false);
  });
});
