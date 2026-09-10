import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { tasks } from "./tasks";
import { users } from "./people";

/**
 * One task waits on another.
 *
 * The handoff the app could not express before: the thumbnail cannot start
 * until the video edit is done, so the designer links their task to the
 * editor's. It is the one thread that reaches across the member silo -- a
 * member sees a linked task as a title, a status and a name, and nothing else
 * -- because "is the thing I am waiting on finished, and who has it" is a
 * question they legitimately need answered.
 *
 * Both tasks are in the same project. A cross-project link would need a task
 * search this does not have yet; the handoffs people actually described are
 * all inside one piece of client work.
 */
export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The task that is waiting. */
    blockedTaskId: uuid("blocked_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** The task it needs finished first. */
    blockingTaskId: uuid("blocking_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * When the upstream assignee was last nudged about this link. Null until
     * the first nudge; it is what rate-limits the reminder to once every few
     * hours so it stays a nudge rather than a pile-on.
     */
    lastNudgedAt: timestamp("last_nudged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One link per ordered pair -- adding the same dependency twice is a no-op,
    // not two rows.
    uniqueIndex("task_links_pair_key").on(t.blockedTaskId, t.blockingTaskId),
    index("task_links_blocked_idx").on(t.blockedTaskId),
    index("task_links_blocking_idx").on(t.blockingTaskId),
    index("task_links_org_idx").on(t.organizationId),
  ],
);

export type TaskLink = typeof taskLinks.$inferSelect;
export type NewTaskLink = typeof taskLinks.$inferInsert;
