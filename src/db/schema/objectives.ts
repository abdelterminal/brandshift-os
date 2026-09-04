import { bigint, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { keyResultDirectionEnum, keyResultUnitEnum, objectiveOutcomeEnum } from "./enums";
import { organizations } from "./organizations";
import { departments, users } from "./people";

/**
 * What the company is trying to do, and how it will know.
 *
 * Three tables, and the split between them is the whole design:
 *
 * - An **objective** is a sentence. `Win back the retainer clients we lost.`
 * - A **key result** is the number that sentence is judged by, with a start,
 *   a target and a direction.
 * - A **checkpoint** is somebody writing down what the number actually is on
 *   a given day.
 *
 * Progress is not a column anywhere. It is computed from the latest checkpoint
 * against the start and the target, and health -- on track, at risk, behind --
 * is computed from that against how much of the period has elapsed. This is
 * the same call as leave balances and the opposite of invoice totals: a
 * balance is a fact about the present, and a stored one is wrong the moment
 * anything behind it changes. A stored RAG status is worse still, because it
 * is a field somebody has to remember to update and nobody ever does.
 *
 * It also means the design rule holds without effort: **no invented metrics**.
 * Every number on the objectives screen traces back to a row a person entered,
 * on a date, with their name on it.
 */
export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /**
     * The period, as two dates rather than a quarter number.
     *
     * Most of these will be quarters and the UI labels them as such when they
     * line up, but an agency also runs a six-week push at a client's pace, and
     * a `quarter` column would have made that unrepresentable for no gain.
     */
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** Whose objective it is. Direction with no name on it belongs to nobody. */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Optional: a department's own objective rather than the company's. */
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    /**
     * Closing is deliberate, and says how it went in somebody's words as well
     * as in the enum. An objective that quietly expires at the end of its
     * quarter teaches nobody anything.
     */
    outcome: objectiveOutcomeEnum("outcome"),
    closingNote: text("closing_note"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "What are we working towards now", which is the list read.
    index("objectives_org_period_idx").on(t.organizationId, t.periodEnd),
    index("objectives_org_owner_idx").on(t.organizationId, t.ownerUserId),
    index("objectives_org_department_idx").on(t.organizationId, t.departmentId),
  ],
);

/**
 * The measurable half.
 *
 * `startValue` is recorded because progress is meaningless without it: going
 * from 40 to 60 against a target of 100 is 33% of the way, not 60%. Storing
 * only the target is the mistake that makes every OKR tool flatter itself.
 *
 * Every value is an integer in the scale its unit defines -- cents, basis
 * points, thousandths, or a plain count. `bigint` in `number` mode, so a
 * revenue target in cents has room and still arrives as a JavaScript number
 * rather than a string that has to be parsed twice.
 */
export const keyResults = pgTable(
  "key_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    unit: keyResultUnitEnum("unit").notNull(),
    direction: keyResultDirectionEnum("direction").notNull().default("increase"),
    startValue: bigint("start_value", { mode: "number" }).notNull(),
    targetValue: bigint("target_value", { mode: "number" }).notNull(),
    position: bigint("position", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("key_results_objective_idx").on(t.objectiveId, t.position),
    index("key_results_org_idx").on(t.organizationId),
  ],
);

/**
 * What the number was, on a day, according to somebody.
 *
 * The row that makes the whole thing honest. A checkpoint is append-only in
 * spirit: it carries who recorded it and when, so a figure on a screen can
 * always be traced to a person rather than to a calculation nobody can audit.
 *
 * `note` is where the sentence goes -- "two invoices slipped into next month"
 * -- which is the part a number on its own never carries and the part that is
 * actually discussed in the review.
 */
export const keyResultCheckpoints = pgTable(
  "key_result_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    keyResultId: uuid("key_result_id")
      .notNull()
      .references(() => keyResults.id, { onDelete: "cascade" }),
    /** In the key result's own scale. */
    value: bigint("value", { mode: "number" }).notNull(),
    /** The day it describes, which is not always the day it was typed. */
    recordedOn: date("recorded_on").notNull(),
    note: text("note"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The read is always "latest first, for this key result".
    index("key_result_checkpoints_kr_idx").on(t.keyResultId, t.recordedOn),
    index("key_result_checkpoints_org_idx").on(t.organizationId),
  ],
);

export type Objective = typeof objectives.$inferSelect;
export type NewObjective = typeof objectives.$inferInsert;
export type KeyResult = typeof keyResults.$inferSelect;
export type NewKeyResult = typeof keyResults.$inferInsert;
export type KeyResultCheckpoint = typeof keyResultCheckpoints.$inferSelect;
export type NewKeyResultCheckpoint = typeof keyResultCheckpoints.$inferInsert;
