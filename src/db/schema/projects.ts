import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { priorityEnum, projectRoleEnum, projectStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { departments, users } from "./people";

/** A unit of work with an owner, a deadline and a team. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Short human key shown in lists and the command palette, e.g. `REB`. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("planning"),
    priority: priorityEnum("priority").notNull().default("medium"),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Day granularity: deadlines are read in the org's timezone, not UTC. */
    startDate: date("start_date"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("projects_org_key_key").on(t.organizationId, t.key),
    index("projects_org_status_idx").on(t.organizationId, t.status),
    index("projects_org_due_idx").on(t.organizationId, t.dueDate),
    index("projects_org_department_idx").on(t.organizationId, t.departmentId),
  ],
);

/**
 * Who is on a project. Kept separate from `tasks.assigneeUserId` so the
 * guided-creation flow can show real workload before anything is assigned.
 */
export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRoleEnum("role").notNull().default("contributor"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_members_project_user_key").on(t.projectId, t.userId),
    index("project_members_org_idx").on(t.organizationId),
    index("project_members_user_idx").on(t.userId),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
