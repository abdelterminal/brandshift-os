import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared enum vocabularies. Every value here is user-visible somewhere, so each
 * one needs an `en` and an `fr` string before a screen ships.
 */

/** Named roles. Module-level permissions live on `memberships.permissions`. */
export const roleEnum = pgEnum("role", ["owner", "admin", "manager", "member"]);

/** Membership lifecycle. `invited` rows exist before the user accepts. */
export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "archived",
]);

/**
 * Task status. `blocked` is a first-class state, not a flag: the admin Today
 * screen is a coordination queue built on blocked / overdue / unassigned.
 */
export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);

/** One priority vocabulary for projects and tasks alike. */
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);

/** Role a person holds inside a single project. */
export const projectRoleEnum = pgEnum("project_role", ["lead", "contributor", "viewer"]);

/** Supported locales. Both ship complete; there is no partial-translation state. */
export const localeEnum = pgEnum("locale", ["en", "fr"]);

/**
 * The kind of record an activity event points at. Phase 2 channels attach to
 * this same spine, so the list grows rather than being replaced.
 */
export const activitySubjectEnum = pgEnum("activity_subject", [
  "organization",
  "user",
  "department",
  "project",
  "task",
]);
