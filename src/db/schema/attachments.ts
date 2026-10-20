import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { documents } from "./documents";
import { organizations } from "./organizations";
import { users } from "./people";

/**
 * A file somebody attached to a document.
 *
 * The first table in this app that points at bytes rather than holding them.
 * File storage was deferred deliberately for a long time -- see the entry in
 * `DECISIONS.md` -- and the objection was never the upload, it was that a file
 * nobody backs up looks like safekeeping while being the opposite. So the row
 * is only half the feature: the other half is `backup.ps1` archiving the
 * volume, and neither is worth having alone.
 *
 * Only briefs carry attachments today. The table is deliberately shaped around
 * `documentId` rather than a polymorphic `(subject_type, subject_id)` pair: an
 * expense receipt, a channel attachment and a diagram in a procedure are each
 * their own feature with their own permission question, and a column pair that
 * can point anywhere answers none of them while making every query unprovable.
 * Widening this later is a migration; guessing now is a shape nobody asked for.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Cascade: a file belonging to a deleted document is unreachable by design. */
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /**
     * What it was called when it was uploaded, shown and used for the download
     * filename -- never for where it sits on disk. See `storageKey`.
     */
    fileName: text("file_name").notNull(),
    /**
     * Decided by the server from the allowlist, not taken from the browser.
     * It is what the download route sends back as `Content-Type`, so trusting
     * the client here would let an upload choose how it is later interpreted.
     */
    mimeType: text("mime_type").notNull(),
    /**
     * `bigint`, not `integer`: a 2 GB ceiling is arbitrary and the column
     * outlives today's 10 MB limit. Read as a JS number -- `Number.MAX_SAFE_INTEGER`
     * is 9 petabytes, so the `mode` is honest here in a way it would not be
     * for money.
     */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /**
     * Where the driver put it: `{organizationId}/{attachmentId}`, derived and
     * never user-supplied. A filename from a browser is attacker-controlled
     * text -- `../../etc/passwd` is the classic, and two people uploading
     * `brief.pdf` is the boring one -- and both stop existing when the name on
     * disk is an id this app chose.
     */
    storageKey: text("storage_key").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attachments_document_idx").on(t.documentId, t.createdAt),
    index("attachments_org_idx").on(t.organizationId),
  ],
);

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
