import { index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { DocumentKind } from "@/lib/data/document-kinds";

import { projectStageEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./people";
import { projects } from "./projects";
import { projectTemplates } from "./templates";

/**
 * The playbook: how a stage sets itself up.
 *
 * The organisation runs one delivery flow -- the eight-stage enum *is* the
 * flow -- so there is no table of named playbooks, just one row per stage that
 * says what reaching that stage should create: the task template to run, and
 * the documents that stage is expected to produce. The procedure is not stored
 * here; it is `sops.stage`, read live.
 *
 * `expected_doc_kinds` is a jsonb array rather than a join table because it is
 * a short list of enum values with no attributes of its own -- the same call
 * as a review's `snapshot`.
 */
export const stagePlaybook = pgTable(
  "stage_playbook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stage: projectStageEnum("stage").notNull(),
    /** The template whose tasks reaching this stage creates. Null = no tasks. */
    templateId: uuid("template_id").references(() => projectTemplates.id, {
      onDelete: "set null",
    }),
    /** The document kinds this stage produces, created as blank stubs. */
    expectedDocKinds: jsonb("expected_doc_kinds").$type<DocumentKind[]>().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stage_playbook_org_stage_key").on(t.organizationId, t.stage)],
);

/**
 * "This stage has been set up for this project."
 *
 * Written once, when the tasks and document stubs for a stage are created, so
 * the "Set up this stage" button offers exactly once and a second click cannot
 * duplicate anything. Carries the counts so the project's activity reads
 * "5 tasks and 2 documents added" without re-counting.
 */
export const projectStageSetup = pgTable(
  "project_stage_setup",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stage: projectStageEnum("stage").notNull(),
    taskCount: integer("task_count").notNull().default(0),
    documentCount: integer("document_count").notNull().default(0),
    setUpAt: timestamp("set_up_at", { withTimezone: true }).notNull().defaultNow(),
    setUpByUserId: uuid("set_up_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("project_stage_setup_project_stage_key").on(t.projectId, t.stage),
    index("project_stage_setup_org_idx").on(t.organizationId),
  ],
);

export type StagePlaybook = typeof stagePlaybook.$inferSelect;
export type NewStagePlaybook = typeof stagePlaybook.$inferInsert;
export type ProjectStageSetup = typeof projectStageSetup.$inferSelect;
export type NewProjectStageSetup = typeof projectStageSetup.$inferInsert;
