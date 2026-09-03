import { createHash } from "node:crypto";

import { slugify } from "@/lib/slug";

/**
 * The old app, translated.
 *
 * `abdelterminal/brandshiftsaas` is Angular + Django + MongoEngine, single
 * tenant, with tasks embedded inside project documents. Everything in this file
 * is a pure function from one of those document shapes to a row this app can
 * store, and nothing here touches a database -- which is what makes the
 * translation testable without a Mongo to read or a Postgres to write.
 *
 * The rule followed throughout: **translate, never invent.** Where the old
 * schema holds something this one has no home for, the value is dropped and
 * counted, and the count is printed in the report. A migration that quietly
 * guesses is worse than one that says what it could not carry.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * A fixed namespace, so the same Mongo document always becomes the same row.
 *
 * This is what makes the migration re-runnable. Ids derived from a counter or
 * from `randomUUID()` would mean a second run duplicated everything, so the
 * only safe rehearsal would be a rehearsal you never repeat. Derived ids let
 * the run be repeated as often as it takes to get it right: every row lands on
 * the id it landed on last time and is updated rather than inserted again.
 */
const NAMESPACE = "6f1a2c7e-4b3d-4a91-9f28-0c5d7e6b4a13";

/**
 * RFC 4122 v5: SHA-1 over the namespace bytes and the name, with the version
 * and variant bits forced. Written out rather than pulled from a dependency
 * because it is fifteen lines and the migration has enough moving parts.
 *
 * SHA-1 is used because the standard specifies it. It is not a security
 * boundary here -- it is a way to spell an ObjectId as a UUID.
 */
export function deterministicId(kind: string, sourceId: string): string {
  const namespaceBytes = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const name = Buffer.from(`${kind}:${sourceId}`, "utf8");

  const hash = createHash("sha1").update(namespaceBytes).update(name).digest();

  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** `ADMIN | EMPLOYEE` is the whole of the old permission model. */
export type OldRole = "ADMIN" | "EMPLOYEE";

export type MappedRole = "owner" | "admin" | "manager" | "member";

/**
 * The old app had two roles; this one has four plus module flags.
 *
 * `ADMIN` becomes `admin`, except for the founder -- see `assignRoles`. No
 * `EMPLOYEE` is promoted to `manager`: the old schema records nothing that
 * would justify it, and inventing a middle tier would hand people permissions
 * nobody granted them.
 */
export function mapRole(role: string | undefined): MappedRole {
  return role === "ADMIN" ? "admin" : "member";
}

/**
 * Every organization needs exactly one founder, and the old app has no such
 * flag. The earliest `ADMIN` account takes it: on this data that is the one
 * account that created everything else.
 *
 * If there is no ADMIN at all the migration refuses rather than promoting
 * somebody. An organization whose owner was chosen by a script is a worse
 * outcome than a run that stops and asks.
 */
export function assignRoles<T extends { email: string; role?: string; createdAt: Date | null }>(
  users: T[],
): { founder: T; roles: Map<string, MappedRole> } | { error: string } {
  const admins = users
    .filter((user) => user.role === "ADMIN")
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  if (admins.length === 0) {
    return {
      error: "No ADMIN account in the source data, so there is nobody to own the org.",
    };
  }

  const founder = admins[0];
  const roles = new Map<string, MappedRole>();

  for (const user of users) {
    roles.set(user.email, user.email === founder.email ? "owner" : mapRole(user.role));
  }

  return { founder, roles };
}

/**
 * The old app split a name in two; this one stores one string, because a great
 * many people do not have exactly two names.
 */
export function personName(first: string | undefined, last: string | undefined): string {
  return [first, last]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Clients, which become companies
// ---------------------------------------------------------------------------

/**
 * Fold a client name to what it would sound like if you read it aloud.
 *
 * The source data has `"Obarfum "` and `"Ô Bar'Fum"` on different projects.
 * They are one client typed by two people on two days, and the migration has
 * to decide whether they are one company or two.
 *
 * Folding is deliberately narrow -- case, accents, and everything that is not
 * a letter or a digit. That is enough to see those two are the same, and it is
 * not fuzzy matching: no edit distance, no threshold, nothing that could pull
 * two genuinely different clients together. Anything the fold does merge is
 * printed in the report by name, so a person can see every decision it made.
 */
export function foldClientName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Of several spellings of one client, the one to keep.
 *
 * The longest, because length is where the detail is: `Ô Bar'Fum` carries an
 * accent and word breaks that `Obarfum` has lost, and no rule that prefers the
 * shorter one can put them back. Ties break alphabetically so that two runs
 * over the same data never disagree.
 */
export function pickCompanyName(spellings: string[]): string {
  return [...new Set(spellings.map((s) => s.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  )[0];
}

// ---------------------------------------------------------------------------
// Project keys
// ---------------------------------------------------------------------------

const KEY_PATTERN = /^[A-Z]{2,5}$/;

/**
 * Invent the short key the old app never had.
 *
 * Projects here are reached and spoken about by a two-to-five letter key, and
 * nothing in the source has one. It is built from the initials of the name --
 * `Mr Dyaf - Filmmaking` becomes `MDF` -- which is what somebody naming it by
 * hand would have written.
 *
 * Digits are not allowed by the key format, so a collision cannot be settled
 * with a number. It is settled by taking more letters out of the name, and
 * failing that by walking a suffix letter. `taken` is mutated, so callers can
 * feed the same set through a whole list and get a unique key each time.
 */
export function projectKey(name: string, taken: Set<string>): string {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => /[A-Za-z]/.test(word));

  const letters = (word: string) => word.replace(/[^A-Za-z]/g, "").toUpperCase();

  const initials = words.map((word) => letters(word)[0]).join("");
  const flattened = words.map(letters).join("");

  const claim = (candidate: string) => {
    if (!KEY_PATTERN.test(candidate) || taken.has(candidate)) return null;
    taken.add(candidate);
    return candidate;
  };

  // Initials first, padded from the first word when there are too few of them:
  // a one-word project still needs two letters.
  for (const candidate of [initials.slice(0, 5), (initials + flattened).slice(0, 5)]) {
    for (let length = Math.max(2, Math.min(candidate.length, 3)); length <= 5; length += 1) {
      const claimed = claim(candidate.slice(0, length));
      if (claimed) return claimed;
    }
  }

  // Everything readable is taken: walk a suffix letter over the best stem
  // there is. Deterministic, and it terminates -- 26 tries per stem length.
  const stem = (initials + flattened + "PROJECT").replace(/[^A-Z]/g, "").slice(0, 4) || "PR";
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index < 26; index += 1) {
      const claimed = claim(stem.slice(0, size) + String.fromCharCode(65 + index));
      if (claimed) return claimed;
    }
  }

  throw new Error(`Could not find a free key for "${name}"`);
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export type MappedProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";
export type MappedTaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type MappedPriority = "low" | "medium" | "high" | "urgent";

/**
 * The source stores display labels as well as canonical ones -- one project in
 * this data reads `Pending` rather than `PENDING`, which the old app patched
 * over in a `clean()` hook. Uppercasing first means the migration reads both.
 *
 * `CANCELLED` becomes `archived`, which is the one lossy step: this app has no
 * cancelled *project*, only an archived one. The count is reported, because
 * "we decided not to do this" and "this is finished with" are not the same
 * sentence and somebody should know the difference was flattened.
 */
export function mapProjectStatus(status: string | undefined): MappedProjectStatus {
  switch ((status ?? "").toUpperCase()) {
    case "IN_PROGRESS":
      return "active";
    case "ON_HOLD":
      return "on_hold";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "archived";
    default:
      return "planning";
  }
}

/**
 * `REVIEW` has no equivalent here and becomes `in_progress`.
 *
 * The alternative was `done`, and it would have been wrong: work in review is
 * work somebody may still hand back. Calling it finished would take it off the
 * screen of the person who has to look at it, which is the more expensive of
 * the two mistakes.
 */
export function mapTaskStatus(status: string | undefined, archived = false): MappedTaskStatus {
  if (archived) return "cancelled";

  switch ((status ?? "").toUpperCase()) {
    case "IN_PROGRESS":
      return "in_progress";
    case "REVIEW":
      return "in_progress";
    case "DONE":
      return "done";
    case "BLOCKED":
      return "blocked";
    default:
      return "todo";
  }
}

/** The one vocabulary that did survive intact. */
export function mapPriority(priority: string | undefined): MappedPriority {
  switch ((priority ?? "").toUpperCase()) {
    case "LOW":
      return "low";
    case "HIGH":
      return "high";
    case "URGENT":
      return "urgent";
    default:
      return "medium";
  }
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/**
 * The old event vocabulary, in this app's words.
 *
 * Both are `subject.verb`, so this is mostly spelling. An event whose type is
 * not on this list is skipped and counted rather than stored under a verb the
 * inbox and the project feed would not know how to render.
 */
const VERBS: Record<string, { verb: string; subject: "project" | "task" }> = {
  PROJECT_CREATED: { verb: "project.created", subject: "project" },
  PROJECT_UPDATED: { verb: "project.updated", subject: "project" },
  PROJECT_COMPLETED: { verb: "project.completed", subject: "project" },
  TASK_CREATED: { verb: "task.created", subject: "task" },
  TASK_ASSIGNED: { verb: "task.assigned", subject: "task" },
  TASK_STARTED: { verb: "task.started", subject: "task" },
  TASK_REVIEWED: { verb: "task.updated", subject: "task" },
  TASK_COMPLETED: { verb: "task.completed", subject: "task" },
  TASK_BLOCKED: { verb: "task.blocked", subject: "task" },
  TASK_REOPENED: { verb: "task.reopened", subject: "task" },
  TASK_UPDATED: { verb: "task.updated", subject: "task" },
};

export function mapEvent(
  eventType: string | undefined,
): { verb: string; subject: "project" | "task" } | null {
  return VERBS[(eventType ?? "").toUpperCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Odds and ends
// ---------------------------------------------------------------------------

/**
 * A description built from the several free-text fields the old task had.
 *
 * `note` and `rejection_reason` have no column of their own here, and dropping
 * them would lose things people wrote by hand. They are appended under a label
 * instead, which keeps the words and is honest about where they came from.
 */
export function taskDescription(task: {
  description?: string | null;
  note?: string | null;
  rejectionReason?: string | null;
}): string | null {
  const parts = [
    task.description?.trim(),
    task.note?.trim() ? `Note: ${task.note.trim()}` : null,
    task.rejectionReason?.trim() ? `Refused: ${task.rejectionReason.trim()}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** A department's two descriptive fields, joined into the one this app has. */
export function departmentDescription(
  subtitle: string | undefined,
  description: string | undefined,
): string | null {
  const parts = [subtitle?.trim(), description?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" -- ") : null;
}

/** Postgres `date` columns want `YYYY-MM-DD` in the org's own reckoning. */
export function dayString(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export { slugify };
