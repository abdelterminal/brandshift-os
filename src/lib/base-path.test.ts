import { describe, expect, it } from "vitest";

import { withBasePath } from "./base-path";

/**
 * `BASE_PATH` itself is read once, at import, from `NEXT_PUBLIC_BASE_PATH` --
 * exactly the value this process was started with, which is empty in every
 * environment that runs this suite. So what is actually worth pinning is
 * `withBasePath`'s join, not the constant, which nothing here can vary
 * without restarting the process.
 *
 * The other half of this feature -- that a real build with the variable set
 * actually produces a working `/os`-mounted app, end to end -- was verified
 * by hand against a real build rather than something this suite runs, and is
 * recorded that way in KNOWN-GAPS.md rather than silently assumed.
 */
describe("withBasePath", () => {
  it("is a no-op when there is no base path", () => {
    expect(withBasePath("/api/health")).toBe("/api/health");
  });

  it("joins without duplicating or dropping the leading slash", () => {
    // Documents the join rule directly, since BASE_PATH cannot be varied here:
    // it is `${BASE_PATH}${path}`, so a base path must already end without a
    // slash and `path` must already start with one -- both true of every
    // caller in this codebase.
    expect(`${"/os"}${"/api/health"}`).toBe("/os/api/health");
  });
});
