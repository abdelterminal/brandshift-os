import { describe, expect, it } from "vitest";

import {
  backoffSeconds,
  formatRecipient,
  isDue,
  isSendable,
  safeSubject,
  MAX_ATTEMPTS,
} from "./message";

/**
 * The parts of the mail transport that can be tested without a mail server.
 *
 * Which matters more here than usual: this deployment runs on a local network
 * and there is never a mail server to test against, so everything that can be
 * decided without one is decided here.
 */

describe("isSendable", () => {
  it("accepts an ordinary address", () => {
    expect(isSendable("lukas.weber@brandshift.test")).toBe(true);
    expect(isSendable("a@b.co")).toBe(true);
    expect(isSendable("first+tag@sub.example.org")).toBe(true);
  });

  it("refuses what could never be delivered", () => {
    for (const bad of [
      "",
      "   ",
      "nobody",
      "@example.com",
      "nobody@",
      "no body@example.com",
      "nobody@localhost",
      "nobody@.com",
      "nobody@example.",
      "nobody@exam..ple.com",
      "two@at@example.com",
    ]) {
      expect(isSendable(bad), bad).toBe(false);
    }
  });

  it("is loose on purpose", () => {
    // Only a delivery attempt can tell whether an address exists. This is
    // catching the empty string and the obvious typo, not validating RFC 5322.
    expect(isSendable("definitely.not.real@brandshift.test")).toBe(true);
  });
});

describe("backoffSeconds", () => {
  it("grows from a minute", () => {
    expect(backoffSeconds(0)).toBe(60);
    expect(backoffSeconds(1)).toBe(120);
    expect(backoffSeconds(2)).toBe(240);
  });

  it("is capped at an hour", () => {
    // A mail server down all morning should be tried again this hour, not in
    // eight days' time.
    expect(backoffSeconds(10)).toBe(3600);
    expect(backoffSeconds(100)).toBe(3600);
  });

  it("copes with a nonsense attempt count", () => {
    expect(backoffSeconds(-5)).toBe(60);
  });
});

describe("isDue", () => {
  const now = new Date("2026-09-04T12:00:00Z");
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

  it("is due immediately when nothing has been tried", () => {
    expect(isDue(0, null, now)).toBe(true);
  });

  it("waits out the backoff", () => {
    expect(isDue(1, ago(30), now)).toBe(false);
    expect(isDue(1, ago(180), now)).toBe(true);
  });

  it("gives up after the last attempt", () => {
    // A queue that retries forever hides a wrong address behind an infinite
    // amount of patience.
    expect(isDue(MAX_ATTEMPTS, ago(100_000), now)).toBe(false);
  });
});

describe("formatRecipient", () => {
  it("uses the name when there is one", () => {
    expect(formatRecipient("a@b.co", "Elena Rossi")).toBe("Elena Rossi <a@b.co>");
  });

  it("falls back to the bare address", () => {
    expect(formatRecipient("a@b.co", null)).toBe("a@b.co");
    expect(formatRecipient("a@b.co", "   ")).toBe("a@b.co");
  });

  it("strips what would break a header rather than escaping it", () => {
    // A header is not the place to be clever about quoting a display name.
    expect(formatRecipient("a@b.co", 'Ev"il <x@y.z>')).toBe("Evil x@y.z <a@b.co>");
    expect(formatRecipient("a@b.co", "Two\r\nLines")).toBe("TwoLines <a@b.co>");
  });
});

describe("safeSubject", () => {
  it("collapses anything that would inject a header", () => {
    expect(safeSubject("Hello\r\nBcc: someone@else.test")).toBe("Hello Bcc: someone@else.test");
  });

  it("trims and caps the length", () => {
    expect(safeSubject("  padded  ")).toBe("padded");
    expect(safeSubject("x".repeat(400))).toHaveLength(200);
  });
});
