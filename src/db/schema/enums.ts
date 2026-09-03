import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared enum vocabularies. Every value here is user-visible somewhere, so each
 * one needs an `en` and an `fr` string before a screen ships.
 */

/** Named roles. Module-level permissions live on `memberships.permissions`. */
export const roleEnum = pgEnum("role", ["owner", "admin", "manager", "member"]);

/** Membership lifecycle. `invited` rows exist before the user accepts. */
export const membershipStatusEnum = pgEnum("membership_status", ["invited", "active", "suspended"]);

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

/**
 * Where a deal has got to.
 *
 * One vocabulary, and a short one. Every pipeline that grows a tenth stage
 * grows it because somebody wanted a report, and then nobody can remember
 * what the difference between two of them is.
 *
 * `won` and `lost` are stages rather than a separate flag: a deal is always
 * somewhere, and "closed" is somewhere.
 */
export const dealStageEnum = pgEnum("deal_stage", [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

/**
 * A quote's life.
 *
 * `accepted` is the end of it -- there is no separate order. For an agency the
 * confirmed engagement is an accepted quote plus the project the work becomes.
 */
export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
]);

/**
 * An invoice's life.
 *
 * A sent invoice is never deleted, only voided: deleting one leaves a hole in
 * a sequence that an auditor reads as a missing document. `part_paid` is a
 * real state, because part payments are real.
 */
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "part_paid",
  "paid",
  "void",
]);

/** Where the money went. Short on purpose: a long list is one nobody uses. */
export const expenseCategoryEnum = pgEnum("expense_category", [
  "subcontractor",
  "software",
  "travel",
  "equipment",
  "production",
  "other",
]);

/** What a company is to us now. Stored, not derived -- see `crm.ts`. */
export const companyStatusEnum = pgEnum("company_status", ["prospect", "client", "former"]);

/**
 * Kinds of time off.
 *
 * Only `annual` comes out of somebody's allowance. Sick leave is not a budget
 * people spend, and treating it as one is how a company teaches its staff to
 * come in ill.
 */
export const leaveTypeEnum = pgEnum("leave_type", [
  "annual",
  "sick",
  "unpaid",
  "parental",
  "other",
]);

/**
 * A request's life. `cancelled` is the requester withdrawing it; `declined` is
 * somebody else saying no. Both keep the row -- "I asked and was told no" is a
 * fact people need to be able to point at.
 */
export const leaveStatusEnum = pgEnum("leave_status", [
  "pending",
  "approved",
  "declined",
  "cancelled",
]);

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
  "meeting",
  "leave",
  "company",
  "deal",
  "quote",
  "invoice",
  "expense",
]);
