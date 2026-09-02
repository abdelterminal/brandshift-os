import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the password it hashed", async () => {
    const stored = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", stored)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("Correct horse battery staple", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toEqual(b);
    await expect(verifyPassword("same", a)).resolves.toBe(true);
    await expect(verifyPassword("same", b)).resolves.toBe(true);
  });

  it("normalises unicode, so the same characters typed two ways still match", async () => {
    // "café" with a combining accent vs. a precomposed é.
    const stored = await hashPassword("café");
    await expect(verifyPassword("café", stored)).resolves.toBe(true);
  });

  it("carries its cost, so old hashes stay verifiable after it is raised", async () => {
    const stored = await hashPassword("whatever");
    const [scheme, cost] = stored.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(cost)).toBeGreaterThanOrEqual(16_384);
    expect(needsRehash(stored)).toBe(false);
  });

  it("flags a weaker hash for upgrade on next sign-in", () => {
    expect(needsRehash("scrypt$1024$c2FsdA$a2V5")).toBe(true);
    expect(needsRehash("$2b$10$notscrypt")).toBe(true);
  });

  it("refuses malformed stored values instead of throwing", async () => {
    await expect(verifyPassword("x", "")).resolves.toBe(false);
    await expect(verifyPassword("x", "garbage")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$notanumber$c2FsdA$a2V5")).resolves.toBe(false);
    // Cost must be a power of two; a hostile value must not reach scrypt.
    await expect(verifyPassword("x", "scrypt$999999999$c2FsdA$a2V5")).resolves.toBe(false);
  });
});
