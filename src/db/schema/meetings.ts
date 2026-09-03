import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./people";
import { projects } from "./projects";

/**
 * Meetings.
 *
 * The one thing on the calendar that this app owns. Everything else it shows
 * -- task deadlines, project dates -- already exists on its own row somewhere
 * else, and is read there rather than copied into an events table. A calendar
 * that keeps its own duplicate of a deadline is a calendar that disagrees with
 * the task by the end of the week.
 *
 * A cancelled meeting keeps its row and stamps a time. People need to see that
 * the thing they blocked an hour out for is off, and a meeting that vanishes
 * silently is one everybody turns up to.
 */
export const meetingResponseEnum = pgEnum("meeting_response", [
  "needs_action",
  "accepted",
  "declined",
  "tentative",
]);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** What it is for. Written before, so people can arrive ready. */
    agenda: text("agenda"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** A room, or a link. One field, because to the person attending it is one thing. */
    location: text("location"),
    /** Set when the meeting is about a project, which puts it on that project. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    organizerUserId: uuid("organizer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * What was decided. Written after, and the reason a past meeting is worth
     * keeping on the calendar at all rather than falling off the end of it.
     */
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The calendar read: one organization, one window of time.
    index("meetings_org_starts_idx").on(t.organizationId, t.startsAt),
    index("meetings_project_starts_idx").on(t.projectId, t.startsAt),
  ],
);

/**
 * Who is expected, and whether they said yes.
 *
 * `needs_action` is the default rather than a null, because "has not replied"
 * is a real answer an organizer needs to see -- not an absence of one.
 */
export const meetingAttendees = pgTable(
  "meeting_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    response: meetingResponseEnum("response").notNull().default("needs_action"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("meeting_attendees_meeting_user_key").on(t.meetingId, t.userId),
    // "What is on my calendar" is this index, read by user.
    index("meeting_attendees_user_idx").on(t.userId),
    index("meeting_attendees_org_idx").on(t.organizationId),
  ],
);

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type MeetingAttendee = typeof meetingAttendees.$inferSelect;
export type MeetingResponse = (typeof meetingResponseEnum.enumValues)[number];
