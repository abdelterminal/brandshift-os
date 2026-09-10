import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { projectStageEnum, sopStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { departments, users } from "./people";

/**
 * How the work is done here.
 *
 * The thing that makes a procedure library worth having is not storage -- a
 * shared folder is storage. It is **knowing which procedures have gone stale**.
 * An SOP nobody has looked at in two years does not sit there harmlessly; it
 * actively tells people to do the wrong thing, with the authority of being
 * written down. So every SOP carries a review interval and the date it was last
 * read, and the screen leads with the ones that are overdue.
 *
 * `reviewDueOn` is deliberately **not** a column. It is the last review plus
 * the interval, computed on read -- see `src/lib/sops.ts`. Storing it would
 * mean a second thing to keep in step with the two facts it comes from, and
 * the first time somebody changed the interval it would be quietly wrong.
 */
export const sops = pgTable(
  "sops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Reached at `/sops/<slug>`, so it is something people paste and type. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** One or two sentences: what this is for, and when to reach for it. */
    summary: text("summary"),
    status: sopStatusEnum("status").notNull().default("draft"),
    /**
     * The delivery-flow stage this procedure belongs to, if any. A project
     * sitting at `production` surfaces the procedure whose `stage` is
     * `production`. `null` means it is a procedure that is not tied to one
     * phase -- an onboarding checklist, a reporting cadence.
     */
    stage: projectStageEnum("stage"),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    /**
     * Whose procedure it is.
     *
     * A document with no name against it is a document nobody reviews, which
     * is the failure this whole table exists to prevent.
     */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * How long a review lasts before it is stale. Six months by default --
     * long enough not to be busywork, short enough that a procedure cannot
     * quietly outlive the way the work is actually done.
     */
    reviewIntervalDays: integer("review_interval_days").notNull().default(180),
    /** Null means it has never been reviewed, which is not the same as overdue. */
    lastReviewedOn: date("last_reviewed_on"),
    lastReviewedByUserId: uuid("last_reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sops_org_slug_key").on(t.organizationId, t.slug),
    index("sops_org_status_idx").on(t.organizationId, t.status),
    index("sops_org_stage_idx").on(t.organizationId, t.stage),
    index("sops_org_department_idx").on(t.organizationId, t.departmentId),
    index("sops_org_reviewed_idx").on(t.organizationId, t.lastReviewedOn),
  ],
);

/**
 * The steps, as rows rather than as prose.
 *
 * A procedure *is* an ordered list of things somebody does, so modelling it as
 * one costs nothing and buys two things. It renders without a Markdown parser,
 * which means no dependency and no HTML-injection surface for text several
 * people can edit. And it gives the Templates milestone something to work
 * with: a step becomes a task exactly as a quote line already becomes one.
 *
 * `detail` is where the prose that does not fit in a step title goes.
 */
export const sopSteps = pgTable(
  "sop_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sopId: uuid("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sop_steps_sop_idx").on(t.sopId, t.position),
    index("sop_steps_org_idx").on(t.organizationId),
  ],
);

export type Sop = typeof sops.$inferSelect;
export type NewSop = typeof sops.$inferInsert;
export type SopStep = typeof sopSteps.$inferSelect;
export type NewSopStep = typeof sopSteps.$inferInsert;
