import { describe, expect, it } from "vitest";

import { generateTempPassword } from "./temp-password";

/**
 * The password an admin reads out loud.
 *
 * Worth asserting rather than eyeballing: it has to clear the app's own
 * ten-character minimum, and it has to stay free of the characters that get
 * misheard -- both are easy to break later by "simplifying" the alphabet.
 */

const CONFUSABLE = /[0o1lis5z2b8]/;

describe("generateTempPassword", () => {
  it("is long enough for the app's own password rule", () => {
    // `passwordSchema` in `lib/auth/actions.ts` is `min(10)`; this is 14.
    expect(generateTempPassword().length).toBeGreaterThanOrEqual(10);
  });

  it("reads as four groups of three", () => {
    expect(generateTempPassword()).toMatch(/^[a-z0-9]{3}(-[a-z0-9]{3}){3}$/);
  });

  it("never contains a character you would have to spell out", () => {
    for (let i = 0; i < 500; i += 1) {
      const password = generateTempPassword();
      expect(password, password).not.toMatch(CONFUSABLE);
    }
  });

  it("does not repeat itself", () => {
    // Not a randomness test -- just that it is drawn fresh each call rather
    // than memoised, which a module-level constant would silently do.
    const seen = new Set(Array.from({ length: 200 }, generateTempPassword));
    expect(seen.size).toBe(200);
  });

  it("uses more than a handful of the alphabet", () => {
    // A broken generator that always picked index 0 would still pass the shape
    // test above.
    const chars = new Set(
      Array.from({ length: 200 }, generateTempPassword).join("").replace(/-/g, ""),
    );
    expect(chars.size).toBeGreaterThan(15);
  });
});
