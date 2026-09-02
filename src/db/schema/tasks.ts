import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { priorityEnum, taskStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./people";
import { projects } from "./projects";

/**
 * A first-class table, not a subdocument. The previous app embedded tasks in
 * the project document and hit write contention and unbounded growth; see
 * DECISIONS.md.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Nullable: personal to-dos exist outside any project. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: priorityEnum("priority").notNull().default("medium"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueDate: date("due_date"),
    estimateHours: numeric("estimate_hours", { precision: 6, scale: 2 }),
    /** Manual ordering inside a list or Kanban column. */
    position: integer("position").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Set together with `status = 'blocked'`; what the reporter typed. */
    blockedReason: text("blocked_reason"),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Drives the member "My Work" list: mine, still open, soonest first.
    index("tasks_org_assignee_status_idx").on(t.organizationId, t.assigneeUserId, t.status),
    // Drives the admin coordination queue: overdue and blocked across the org.
    index("tasks_org_status_due_idx").on(t.organizationId, t.status, t.dueDate),
    index("tasks_org_project_idx").on(t.organizationId, t.projectId),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskStatus = Task["status"];
