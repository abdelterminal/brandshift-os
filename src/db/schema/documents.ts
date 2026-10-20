import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./crm";
import { documentKindEnum } from "./enums";
import { organizations } from "./organizations";
import { departments, users } from "./people";
import { projects } from "./projects";

/**
 * The prose a project runs on.
 *
 * A procedure (`sops`) is how a job is done -- an ordered list of steps, the
 * same for every client. A **document** is the thing a job produces: this
 * client's brief, this client's marketing plan, the shoot plan for that
 * shoot. Most belong to a project (`projectId`); a few belong to the whole
 * organization instead (a playbook, an HQ reference page), and those have
 * `projectId` null.
 *
 * It is modelled as ordered sections rather than one rich-text blob for the
 * same reason a procedure is -- see `sops.ts`. The body renders with no
 * Markdown parser and no HTML, which is what keeps text several people edit
 * from becoming an injection surface. The Notion export these were imported
 * from is already `heading_2`-sectioned, so nothing is lost by the shape.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Reached at `/documents/<slug>`, so it is something people paste and type. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** One or two sentences: what this document is, so a list is scannable. */
    summary: text("summary"),
    kind: documentKindEnum("kind").notNull().default("note"),
    /**
     * The project this belongs to. `null` for an organization-level document
     * -- a playbook, a reference page. `set null` on delete keeps the document
     * if its project is removed; it becomes an org-level one.
     */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /**
     * The client this belongs to, for a document about the relationship rather
     * than about one job -- a client brief, which holds the tone, the brand
     * rules and the standing do's and don'ts every project for them inherits.
     *
     * Independent of `projectId` rather than derived through it: a project's
     * brief is about that job, and the client's is about the client, and a
     * project can be reassigned to another company without its own brief
     * becoming someone else's. `set null` for the same reason the project
     * reference uses it -- the prose outlives the row it hung on.
     */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Retired rather than deleted, as everywhere else here. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("documents_org_slug_key").on(t.organizationId, t.slug),
    index("documents_org_kind_idx").on(t.organizationId, t.kind),
    index("documents_org_project_idx").on(t.organizationId, t.projectId),
    index("documents_org_company_idx").on(t.organizationId, t.companyId),
    /*
      "The brief" has to mean one thing.

      Every screen that shows a brief asks for *the* brief of a project or a
      client and renders the row it gets back, so two live ones would make
      which of them people see a matter of row order. Partial, so it binds
      only briefs -- a project may still carry any number of notes, shoot
      plans and case studies -- and only live ones, so archiving a brief frees
      the slot for its replacement rather than blocking it.
    */
    uniqueIndex("documents_org_project_brief_key")
      .on(t.organizationId, t.projectId)
      .where(sql`${t.kind} = 'brief' and ${t.archivedAt} is null`),
    uniqueIndex("documents_org_company_brief_key")
      .on(t.organizationId, t.companyId)
      .where(sql`${t.kind} = 'brief' and ${t.archivedAt} is null`),
  ],
);

/**
 * A section of a document, as a row.
 *
 * The `sop_steps` shape exactly -- `position`, a `title`, and a `detail` that
 * is plain text with deliberate line breaks (rendered `whitespace-pre-line`).
 * Replaced wholesale on edit, like a procedure's steps.
 */
export const documentSections = pgTable(
  "document_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_sections_document_idx").on(t.documentId, t.position),
    index("document_sections_org_idx").on(t.organizationId),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentSection = typeof documentSections.$inferSelect;
export type NewDocumentSection = typeof documentSections.$inferInsert;
