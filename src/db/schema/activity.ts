import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { activitySubjectEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./people";
import { projects } from "./projects";
import { tasks } from "./tasks";

/**
 * The feed spine. Every meaningful mutation writes one row here, which powers
 * the Activity tabs in Phase 1 and is the surface Phase 2 channels, threads and
 * notifications attach to. Designing it now is why "channels later" is cheap.
 *
 * Rows are append-only: an event records what happened, and history is never
 * rewritten to match a later correction.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Null when the system acted rather than a person. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Dotted verb, e.g. `task.completed`, `project.created`, `member.invited`. */
    verb: text("verb").notNull(),
    subjectType: activitySubjectEnum("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /**
     * Denormalised so a project's Activity tab is one index scan rather than a
     * join per subject type.
     */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    /**
     * Verb-specific payload -- previous and next values, the blocker text, the
     * invited email. Rendered through next-intl, never shown raw.
     */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_events_org_created_idx").on(t.organizationId, t.createdAt),
    index("activity_events_subject_idx").on(t.organizationId, t.subjectType, t.subjectId),
    index("activity_events_project_created_idx").on(t.projectId, t.createdAt),
    index("activity_events_actor_created_idx").on(t.actorUserId, t.createdAt),
  ],
);

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;
