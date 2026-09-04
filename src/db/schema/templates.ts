import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { priorityEnum } from "./enums";
import { organizations } from "./organizations";
import { departments, users } from "./people";

/**
 * A project shape worth doing again.
 *
 * The third thing in this app that turns into tasks -- after a quote's lines
 * and an SOP's steps -- and the one whose whole purpose is to. A template is
 * what a project looked like the last time it went well, kept so the next one
 * starts from there rather than from a blank board.
 *
 * The single thing that makes it more than a checklist is `offsetDays` on each
 * task: a template carries a *schedule*, not just a list. "Kickoff on day
 * zero, first cut on day fourteen, delivery on day thirty" is the part nobody
 * reconstructs correctly from memory, and it is the part that makes a deadline
 * appear on the calendar the moment the project is created.
 */
export const projectTemplates = pgTable(
  "project_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Reached at `/templates/<slug>`. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Retired rather than deleted, as everywhere else here. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("project_templates_org_slug_key").on(t.organizationId, t.slug),
    index("project_templates_org_department_idx").on(t.organizationId, t.departmentId),
  ],
);

/**
 * A task the template will create, and when it is due.
 *
 * `offsetDays` is counted from the project's start date, so a template can be
 * started on any Monday and produce the same shape of schedule. Zero means the
 * day the project starts; a task with no deadline at all uses `null`, because
 * plenty of work in a project genuinely has no date and forcing one on it is
 * how a board fills up with deadlines nobody believes.
 *
 * There is deliberately **no default assignee**. A template outlives the
 * people in it -- the person who always did the edit leaves, and every project
 * started afterwards quietly assigns work to somebody who is gone. Assigning
 * is a decision made per project, with the workload of the actual team in
 * front of you, which is what the project wizard already exists to show.
 */
export const templateTasks = pgTable(
  "template_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => projectTemplates.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    description: text("description"),
    priority: priorityEnum("priority").notNull().default("medium"),
    /** Days after the project's start date. Null means no deadline. */
    offsetDays: integer("offset_days"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("template_tasks_template_idx").on(t.templateId, t.position),
    index("template_tasks_org_idx").on(t.organizationId),
  ],
);

export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type NewProjectTemplate = typeof projectTemplates.$inferInsert;
export type TemplateTask = typeof templateTasks.$inferSelect;
export type NewTemplateTask = typeof templateTasks.$inferInsert;
