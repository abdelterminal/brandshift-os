import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { activityEvents } from "./activity";
import { organizations } from "./organizations";
import { users } from "./people";

/**
 * One row per person who should hear about one event.
 *
 * Notifications attach to `activity_events` rather than duplicating them: the
 * event says what happened, and this says who needs to know and whether they
 * have seen it. That is the spine DECISIONS.md set aside for exactly this, and
 * Phase 2 channels hang off the same one.
 *
 * Fanning out on write, rather than deriving the inbox from a query at read
 * time, is a deliberate trade. It costs a few rows per event and buys the two
 * things an inbox actually needs: per-person read state, and an unread count
 * that is one indexed count rather than a scan of the whole feed re-filtered
 * for relevance on every page load.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Who should hear about it. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What happened. The event owns the verb, the subject and the metadata. */
    activityEventId: uuid("activity_event_id")
      .notNull()
      .references(() => activityEvents.id, { onDelete: "cascade" }),
    /** Null until they have seen it. */
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One notification per person per event, so a retried write cannot make
    // the same thing arrive twice.
    uniqueIndex("notifications_user_event_key").on(t.userId, t.activityEventId),
    // Drives both the inbox list and the unread count on the rail.
    index("notifications_user_read_idx").on(t.userId, t.readAt, t.createdAt),
    index("notifications_org_idx").on(t.organizationId),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
