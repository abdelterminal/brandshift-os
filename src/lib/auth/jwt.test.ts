import { beforeAll, describe, expect, it } from "vitest";

import { digest, newJti, signSessionToken, verifySessionToken } from "./jwt";

/**
 * The token's guarantees.
 *
 * The signature is what stops someone minting their own cookie, and the digest
 * is what stops a stolen database being replayed as one. Both are cheap to
 * break by accident -- swapping the algorithm, storing the raw `jti` -- so
 * both are pinned here.
 */

beforeAll(() => {
  process.env.JWT_SECRET = "a-test-secret-that-is-comfortably-long-enough";
  process.env.SESSION_TTL = "7d";
});

describe("session tokens", () => {
  it("round-trips the claims it was given", async () => {
    const jti = newJti();
    const token = await signSessionToken({ sub: "user-1", jti });

    await expect(verifySessionToken(token)).resolves.toEqual({ sub: "user-1", jti });
  });

  it("refuses a token signed with a different secret", async () => {
    const token = await signSessionToken({ sub: "user-1", jti: newJti() });

    process.env.JWT_SECRET = "a-completely-different-secret-of-good-length";
    const result = await verifySessionToken(token);
    process.env.JWT_SECRET = "a-test-secret-that-is-comfortably-long-enough";

    expect(result).toBeNull();
  });

  it("refuses a tampered token", async () => {
    const token = await signSessionToken({ sub: "user-1", jti: newJti() });
    const [header, payload, signature] = token.split(".");

    // Swap the subject for someone else's and keep the original signature.
    const forged = JSON.stringify({ sub: "user-2" });
    const tamperedPayload = Buffer.from(forged).toString("base64url");

    await expect(
      verifySessionToken([header, tamperedPayload, signature].join(".")),
    ).resolves.toBeNull();
    // The untouched token still verifies, so the test is testing the tamper.
    await expect(verifySessionToken([header, payload, signature].join("."))).resolves.not.toBeNull();
  });

  it("refuses obvious rubbish without throwing", async () => {
    for (const value of ["", "not-a-token", "a.b.c", "..", "null"]) {
      await expect(verifySessionToken(value)).resolves.toBeNull();
    }
  });

  it("refuses an expired token", async () => {
    process.env.SESSION_TTL = "1s";
    const token = await signSessionToken({ sub: "user-1", jti: newJti() });
    process.env.SESSION_TTL = "7d";

    // jose allows no clock skew by default, so a token whose `exp` is in the
    // past is rejected outright.
    const expired = token;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(verifySessionToken(expired)).resolves.toBeNull();
  });
});

describe("jti", () => {
  it("is unguessable and never repeats", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newJti()));
    expect(seen.size).toBe(200);
    // 32 bytes, base64url: no padding, no + or /.
    for (const jti of seen) expect(jti).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("digest", () => {
  it("is a stable SHA-256 hex string", async () => {
    // Known vector, so a change of algorithm cannot pass unnoticed.
    await expect(digest("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("differs for different input", async () => {
    const [a, b] = await Promise.all([digest(newJti()), digest(newJti())]);
    expect(a).not.toBe(b);
  });

  it("does not contain the value it hashed", async () => {
    // What lands in the database must not be reversible into a cookie.
    const jti = newJti();
    await expect(digest(jti)).resolves.not.toContain(jti);
  });
});
