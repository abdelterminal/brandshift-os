import { boolean, date, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { leaveStatusEnum, leaveTypeEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./people";

/**
 * Time off.
 *
 * One table. A balance is not stored anywhere: it is the allowance on the
 * membership minus the approved days in the year, computed when somebody
 * looks. A stored balance is a number that has to be kept in step with the
 * requests it came from, and the first time an approval is undone it is wrong
 * with nothing to say so -- the same reason the calendar owns no rows.
 *
 * A declined or cancelled request keeps its row. "I asked and was told no" is
 * a fact people need, and a request that disappears is one nobody can point at.
 */
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    /** Inclusive, both ends. A one-day request has the same date twice. */
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /**
     * Half a day, and only meaningful when the request is one day long.
     * Supporting arbitrary half-days at both ends of a range is a combinatorial
     * mess for a case that is nearly always "the afternoon off".
     */
    halfDay: boolean("half_day").notNull().default(false),
    /**
     * Working days this costs, computed when the request is made and stored.
     *
     * Stored rather than derived because it is what the balance sums, and
     * because it should not change retroactively if the weekend rule ever
     * does -- a request approved under one set of rules stays what it was.
     */
    workingDays: numeric("working_days", { precision: 4, scale: 1 }).notNull(),
    reason: text("reason"),
    status: leaveStatusEnum("status").notNull().default("pending"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Why it was refused. A "no" with no reason is one people ask about twice. */
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "Who is away between these dates", which is the calendar read.
    index("leave_requests_org_start_idx").on(t.organizationId, t.startDate),
    // "What have I asked for", and the balance sum.
    index("leave_requests_user_start_idx").on(t.userId, t.startDate),
    index("leave_requests_status_idx").on(t.organizationId, t.status),
  ],
);

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;
