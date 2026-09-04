/**
 * What a message is, and when to try again.
 *
 * Pure, so the parts that decide whether an address is worth attempting and
 * whether a failure is worth retrying can be tested without a mail server --
 * which matters more here than usual, because on this deployment there is
 * never a mail server to test against.
 */

export type MailKind = "invite" | "reset" | "notification";

export type MailMessage = {
  toEmail: string;
  toName: string | null;
  subject: string;
  /** Plain text. One blank line between paragraphs; nothing is rendered. */
  body: string;
  kind: MailKind;
};

/**
 * How many times a message is attempted before it is left alone.
 *
 * Five, and then it stays `failed` with its last error on the row for somebody
 * to look at. A queue that retries forever is a queue that hides a wrong
 * address behind an infinite amount of patience.
 */
export const MAX_ATTEMPTS = 5;

/**
 * Whether an address is worth attempting at all.
 *
 * Deliberately loose. This is not validating that an address exists -- only a
 * delivery attempt can do that -- it is catching the empty string and the
 * obvious typo before a row is queued that can never succeed. Anything with an
 * `@`, something either side of it, and a dot in the domain gets a try.
 */
export function isSendable(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 320) return false;
  if (/\s/.test(trimmed)) return false;

  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (local.length === 0 || domain.length === 0) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;

  return true;
}

/**
 * How long to wait before the next attempt, in seconds.
 *
 * Exponential from a minute, capped at an hour: 60, 120, 240, 480, 960. With
 * `MAX_ATTEMPTS` at five the cap never actually binds -- it is there so that
 * raising the limit does not quietly produce a retry in eight days' time.
 *
 * The first version clamped the exponent to `MAX_ATTEMPTS` as well, which made
 * the cap unreachable by construction: dead code that read like a safeguard.
 */
export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, attempts));
}

/** Whether a failed message is due another attempt yet. */
export function isDue(attempts: number, lastAttemptAt: Date | null, now: Date): boolean {
  if (attempts >= MAX_ATTEMPTS) return false;
  if (!lastAttemptAt) return true;

  const waited = (now.getTime() - lastAttemptAt.getTime()) / 1000;
  return waited >= backoffSeconds(attempts);
}

/**
 * `Name <address>`, or the bare address when there is no name.
 *
 * A name containing a quote or an angle bracket is stripped rather than
 * escaped: this goes into a mail header, and a header is not a place to be
 * clever about quoting somebody's display name.
 */
export function formatRecipient(email: string, name: string | null): string {
  const clean = (name ?? "").replace(/["<>\r\n]/g, "").trim();
  return clean ? `${clean} <${email}>` : email;
}

/**
 * A subject safe to put in a header.
 *
 * Newlines are removed rather than encoded. A subject line carrying a `\n` is
 * how a header injection starts, and no legitimate subject needs one.
 */
export function safeSubject(subject: string): string {
  return subject
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 200);
}
