import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { mailStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./people";

/**
 * Every message the app wants to send.
 *
 * The row is written **whether or not anything is sent**, and that is the whole
 * design. This deployment runs on a local network with no mail server, so the
 * default driver records and delivers nothing -- but the app still behaves as
 * though mail exists: an invite is queued, and an admin can open the outbox and
 * read exactly what would have gone out, including the link.
 *
 * The day this moves to a VPS, `MAIL_DRIVER=smtp` starts delivering the same
 * rows. Nothing else changes: no caller learns a new API, no feature has to be
 * rewritten, and the messages queued before the move are still there to send.
 * That is the margin, and it is the reason the outbox is not a debug feature
 * bolted on beside a sender.
 *
 * `body` holds the message in full, invite links included. Anybody who can read
 * this table can already invite people, so it grants nothing new -- but it is
 * the reason the outbox screen is behind `member.invite` rather than being
 * shown to everyone.
 */
export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The address as typed, not a user reference: a recipient may not exist yet. */
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull(),
    /** Plain text. HTML email is a rendering project of its own -- see KNOWN-GAPS. */
    body: text("body").notNull(),
    /** What kind of message this is, for the outbox screen to group by. */
    kind: text("kind").notNull(),
    status: mailStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    /** The last failure, kept so somebody can see *why* rather than that it failed. */
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The flush reads "queued or failed, oldest first".
    index("outbox_org_status_idx").on(t.organizationId, t.status, t.createdAt),
  ],
);

/**
 * A one-time link.
 *
 * Invites and password resets are the same shape -- prove you can read an
 * address, then set a password -- so they are one table with a `purpose` rather
 * than two tables that would drift apart.
 *
 * Only the digest is stored, exactly as with sessions: a leaked database yields
 * no usable link. The raw token exists once, in the email, and is never written
 * down anywhere the app can read it back.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull(),
    /** `invite` or `reset`. Both end at the same "choose a password" screen. */
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /**
     * Set the moment it is spent. A token is single-use: the row is kept rather
     * than deleted so a second click says "this link has been used" instead of
     * the indistinguishable "this link is not valid".
     */
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_tokens_digest_key").on(t.tokenDigest),
    index("auth_tokens_user_idx").on(t.userId, t.purpose),
  ],
);

export type OutboxMessage = typeof outboxMessages.$inferSelect;
export type NewOutboxMessage = typeof outboxMessages.$inferInsert;
export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
