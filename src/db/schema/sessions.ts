import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./people";

/**
 * Server-side half of the auth pair. The browser holds an HttpOnly cookie
 * carrying an HS256 JWT; this row is what makes it revocable. Middleware
 * checks the digest on every request, so signing out a device is immediate
 * rather than waiting for the token to expire.
 *
 * Only the digest is stored -- a leaked database still yields no usable token.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The org this session is currently acting in; changed by the org switcher. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    /** SHA-256 of the token's secret half, hex encoded. */
    tokenDigest: text("token_digest").notNull().unique(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    /**
     * Last successful password re-entry. Destructive actions require this to
     * be recent; routine writes never prompt at all.
     */
    reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
