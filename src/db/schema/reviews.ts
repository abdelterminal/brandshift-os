import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./people";

/**
 * The weekly review, as a record rather than a screen.
 *
 * Insights and Objectives already hold every number somebody would read out in
 * the meeting. What neither holds is what was *said* about them, and what was
 * decided -- which is the only part that changes what happens next week.
 *
 * The interesting decision is `snapshot`. While a review is a draft its
 * figures are computed live, because the week is still moving. When it is
 * published they are frozen into this column, because a review is a document:
 * opening last quarter's and finding today's numbers in it would be useless,
 * and worse, misleading -- the room did not see those numbers. This is the
 * same call as an invoice's stored totals, and the deliberate opposite of a
 * leave balance.
 */
export type ReviewSnapshot = {
  /** Tasks finished and started during the week under review. */
  completed: number;
  created: number;
  /** Counts, not lists: the detail lives on the screens it came from. */
  projectsAtRisk: number;
  blocked: number;
  objectivesOpen: number;
  objectivesBehind: number;
  objectivesNotMeasured: number;
  proceduresOverdue: number;
  peopleAway: number;
};

export const weeklyReviews = pgTable(
  "weekly_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * The Monday of the week under review, which is also the identity of the
     * review: one per week, enforced by the unique index rather than by hoping.
     * It is what `/reviews/<weekStart>` is addressed by.
     */
    weekStart: date("week_start").notNull(),
    /** The day the conversation actually happened, which is often not Monday. */
    heldOn: date("held_on"),
    facilitatorUserId: uuid("facilitator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** What went well, and what did not. Two boxes, because that is the meeting. */
    highlights: text("highlights"),
    concerns: text("concerns"),
    /** Frozen when published; null while it is still a draft. */
    snapshot: jsonb("snapshot").$type<ReviewSnapshot | null>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("weekly_reviews_org_week_key").on(t.organizationId, t.weekStart),
    index("weekly_reviews_org_published_idx").on(t.organizationId, t.publishedAt),
  ],
);

/**
 * What was decided.
 *
 * The output of the meeting, and the reason to hold one. A decision carries an
 * owner because a decision nobody owns is a conversation -- which is precisely
 * the criticism weekly reviews attract, and the thing this column exists to
 * answer.
 */
export const reviewDecisions = pgTable(
  "review_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => weeklyReviews.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    decision: text("decision").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_decisions_review_idx").on(t.reviewId, t.position),
    index("review_decisions_org_idx").on(t.organizationId),
    index("review_decisions_owner_idx").on(t.organizationId, t.ownerUserId),
  ],
);

export type WeeklyReview = typeof weeklyReviews.$inferSelect;
export type NewWeeklyReview = typeof weeklyReviews.$inferInsert;
export type ReviewDecision = typeof reviewDecisions.$inferSelect;
export type NewReviewDecision = typeof reviewDecisions.$inferInsert;
