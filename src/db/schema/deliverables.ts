import { date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { deliverableStatusEnum, projectStageEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./people";
import { projects } from "./projects";

/**
 * A deliverable: the thing a client project produces.
 *
 * A task is work -- todo, doing, done. A deliverable is an *artifact*, and it
 * has a life a task's status cannot express: it is produced, checked
 * internally, sent to the client, revised against their feedback, and
 * published. So it is its own table with its own status enum, not a `kind`
 * column on `tasks` -- a row that was sometimes one and sometimes the other
 * would need every task query to know the difference.
 *
 * Always part of a project (`project_id` not null). `stage` records which
 * phase of the delivery flow produced it, so "everything from Production" is a
 * filter rather than a guess.
 */
export const deliverables = pgTable(
  "deliverables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The delivery-flow stage that produced it, if the project is on the flow. */
    stage: projectStageEnum("stage"),
    title: text("title").notNull(),
    description: text("description"),
    status: deliverableStatusEnum("status").notNull().default("producing"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    /** What the client asked for, set when the deliverable goes to `revising`. */
    clientFeedback: text("client_feedback"),
    dueDate: date("due_date"),
    /** Manual ordering inside a status group. */
    position: integer("position").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deliverables_org_project_status_idx").on(t.organizationId, t.projectId, t.status),
    index("deliverables_org_assignee_status_idx").on(
      t.organizationId,
      t.assigneeUserId,
      t.status,
    ),
  ],
);

export type Deliverable = typeof deliverables.$inferSelect;
export type NewDeliverable = typeof deliverables.$inferInsert;
export type DeliverableStatus = Deliverable["status"];
