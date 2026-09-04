import "server-only";

import { eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  leaveRequests,
  reviewDecisions,
  tasks,
  users,
  weeklyReviews,
  type ReviewSnapshot,
} from "@/db/schema";
import { withOrg } from "@/db/tenancy";
import { isUuid } from "@/lib/uuid";
import type { Actor } from "@/lib/authz";
import { longestBlocked, projectsAtRisk } from "@/lib/data/insights";
import { listOpenObjectives } from "@/lib/data/objectives";
import { sopSummary } from "@/lib/data/sops";
import { weekRange } from "@/lib/reviews";

/**
 * The weekly review.
 *
 * Every figure in a snapshot comes from a function that already existed --
 * insights, objectives, procedures, leave. Nothing new is counted here, which
 * is deliberate: a review that invented its own numbers would be a fourth
 * place for the company's figures to disagree with itself.
 */

export type DecisionView = {
  id: string;
  decision: string;
  ownerUserId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  position: number;
};

export type ReviewView = {
  id: string;
  weekStart: string;
  heldOn: string | null;
  facilitatorUserId: string | null;
  facilitatorName: string | null;
  highlights: string | null;
  concerns: string | null;
  publishedAt: Date | null;
  /** Frozen once published; computed live while it is a draft. */
  snapshot: ReviewSnapshot;
  decisions: DecisionView[];
};

/**
 * The numbers as they stand for one week.
 *
 * Read from the same functions the Insights, Objectives and Procedures screens
 * use, so the review and the screens can never disagree. Counted for the week
 * under review rather than for today, which is what makes a review of three
 * weeks ago mean anything.
 */
export async function computeSnapshot(actor: Actor, weekStart: string): Promise<ReviewSnapshot> {
  const { start, end } = weekRange(weekStart);
  const scope = withOrg(actor.organizationId);

  const [completed, created, atRisk, blocked, objectives, procedures, away] = await Promise.all([
    scope.count(
      tasks,
      eq(tasks.status, "done"),
      gte(sql`${tasks.completedAt}::date`, start),
      lte(sql`${tasks.completedAt}::date`, end),
    ),
    scope.count(
      tasks,
      gte(sql`${tasks.createdAt}::date`, start),
      lte(sql`${tasks.createdAt}::date`, end),
    ),
    projectsAtRisk(actor, end),
    longestBlocked(actor, new Date(`${end}T23:59:59Z`)),
    listOpenObjectives(actor, new Date(`${end}T00:00:00Z`)),
    sopSummary(actor, end),
    scope.count(
      leaveRequests,
      eq(leaveRequests.status, "approved"),
      lte(leaveRequests.startDate, end),
      gte(leaveRequests.endDate, start),
    ),
  ]);

  return {
    completed,
    created,
    projectsAtRisk: atRisk.length,
    blocked: blocked.length,
    objectivesOpen: objectives.length,
    objectivesBehind: objectives.filter((objective) => objective.health === "behind").length,
    objectivesNotMeasured: objectives.filter((objective) => objective.health === "not_measured")
      .length,
    proceduresOverdue: procedures.overdue + procedures.never,
    peopleAway: away,
  };
}

const REVIEW_FIELDS = {
  id: weeklyReviews.id,
  weekStart: weeklyReviews.weekStart,
  heldOn: weeklyReviews.heldOn,
  facilitatorUserId: weeklyReviews.facilitatorUserId,
  facilitatorName: users.name,
  highlights: weeklyReviews.highlights,
  concerns: weeklyReviews.concerns,
  snapshot: weeklyReviews.snapshot,
  publishedAt: weeklyReviews.publishedAt,
};

const REVIEW_JOINS = [
  { table: users, on: eq(weeklyReviews.facilitatorUserId, users.id), type: "left" as const },
];

/** Every review, newest week first. The snapshot is not needed for a list. */
export async function listReviews(actor: Actor) {
  const rows = await withOrg(actor.organizationId).selectJoined(
    weeklyReviews,
    REVIEW_FIELDS,
    REVIEW_JOINS,
  );

  return rows.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export async function getReview(actor: Actor, weekStart: string): Promise<ReviewView | null> {
  const [row] = await withOrg(actor.organizationId).selectJoined(
    weeklyReviews,
    REVIEW_FIELDS,
    REVIEW_JOINS,
    eq(weeklyReviews.weekStart, weekStart),
  );

  if (!row) return null;

  const decisionRows = await withOrg(actor.organizationId).selectJoined(
    reviewDecisions,
    {
      id: reviewDecisions.id,
      decision: reviewDecisions.decision,
      ownerUserId: reviewDecisions.ownerUserId,
      ownerName: users.name,
      dueDate: reviewDecisions.dueDate,
      position: reviewDecisions.position,
    },
    [{ table: users, on: eq(reviewDecisions.ownerUserId, users.id), type: "left" }],
    eq(reviewDecisions.reviewId, row.id),
  );

  // Published: what the room saw. Draft: what is true right now.
  const snapshot = row.snapshot ?? (await computeSnapshot(actor, row.weekStart));

  return {
    ...row,
    snapshot,
    decisions: decisionRows.sort((a, b) => a.position - b.position),
  };
}

export async function getReviewById(actor: Actor, reviewId: string) {
  // A malformed id is a missing row, not a server error -- see `isUuid`.
  if (!isUuid(reviewId)) return null;

  const [row] = await withOrg(actor.organizationId).select(
    weeklyReviews,
    eq(weeklyReviews.id, reviewId),
  );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type DecisionInput = {
  decision: string;
  ownerUserId: string | null;
  dueDate: string | null;
};

/** Open a review for a week. One per week; the unique index enforces it. */
export async function openReview(
  actor: Actor,
  weekStart: string,
  heldOn: string,
): Promise<{ id: string } | "exists" | null> {
  const existing = await withOrg(actor.organizationId).selectFields(
    weeklyReviews,
    { id: weeklyReviews.id },
    eq(weeklyReviews.weekStart, weekStart),
  );
  if (existing.length > 0) return "exists";

  const [created] = await withOrg(actor.organizationId).insert(weeklyReviews, {
    weekStart,
    heldOn,
    facilitatorUserId: actor.userId,
    createdByUserId: actor.userId,
  });

  return created ? { id: created.id } : null;
}

export async function saveReview(
  actor: Actor,
  input: {
    reviewId: string;
    highlights: string | null;
    concerns: string | null;
    decisions: DecisionInput[];
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [review] = await scope.select(weeklyReviews, eq(weeklyReviews.id, input.reviewId));
    if (!review) return false;

    await scope.update(
      weeklyReviews,
      { highlights: input.highlights, concerns: input.concerns, updatedAt: new Date() },
      eq(weeklyReviews.id, input.reviewId),
    );

    await scope.delete(reviewDecisions, eq(reviewDecisions.reviewId, input.reviewId));

    if (input.decisions.length > 0) {
      await scope.insert(
        reviewDecisions,
        input.decisions.map((decision, index) => ({
          reviewId: input.reviewId,
          position: index,
          decision: decision.decision,
          ownerUserId: decision.ownerUserId,
          dueDate: decision.dueDate,
        })),
      );
    }

    return true;
  });
}

/**
 * Publish, and freeze the numbers.
 *
 * The moment a review stops being a draft it becomes a document, so the
 * figures it was written against are written down with it. Opening it next
 * year and finding next year's numbers would be worse than useless -- the room
 * did not see those.
 */
export async function publishReview(actor: Actor, reviewId: string): Promise<boolean> {
  const review = await getReviewById(actor, reviewId);
  if (!review || review.publishedAt) return false;

  const snapshot = await computeSnapshot(actor, review.weekStart);

  const updated = await withOrg(actor.organizationId).update(
    weeklyReviews,
    {
      snapshot,
      publishedAt: new Date(),
      publishedByUserId: actor.userId,
      updatedAt: new Date(),
    },
    eq(weeklyReviews.id, reviewId),
    isNull(weeklyReviews.publishedAt),
  );

  return updated.length > 0;
}

/** Back to a draft. The snapshot is cleared, because it is no longer a record. */
export async function unpublishReview(actor: Actor, reviewId: string): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    weeklyReviews,
    { snapshot: null, publishedAt: null, publishedByUserId: null, updatedAt: new Date() },
    eq(weeklyReviews.id, reviewId),
    sql`${weeklyReviews.publishedAt} is not null`,
  );

  return updated.length > 0;
}

/**
 * Decisions somebody owns and has not yet been past the date on.
 *
 * The thing a review is for: it produced a decision, somebody's name is on it,
 * and here it is again next week whether or not anybody remembered.
 */
export async function openDecisions(actor: Actor, today: string) {
  const published = await withOrg(actor.organizationId).selectFields(
    weeklyReviews,
    { id: weeklyReviews.id, weekStart: weeklyReviews.weekStart },
    sql`${weeklyReviews.publishedAt} is not null`,
  );

  if (published.length === 0) return [];

  const rows = await withOrg(actor.organizationId).selectJoined(
    reviewDecisions,
    {
      id: reviewDecisions.id,
      decision: reviewDecisions.decision,
      ownerName: users.name,
      dueDate: reviewDecisions.dueDate,
      reviewId: reviewDecisions.reviewId,
    },
    [{ table: users, on: eq(reviewDecisions.ownerUserId, users.id), type: "left" }],
    inArray(
      reviewDecisions.reviewId,
      published.map((review) => review.id),
    ),
    // `isNotNull`, not `ne(..., null)`: in SQL nothing is ever unequal to
    // null, so the first version of this silently returned no rows at all.
    isNotNull(reviewDecisions.dueDate),
    lte(reviewDecisions.dueDate, today),
  );

  const weekById = new Map(published.map((review) => [review.id, review.weekStart]));

  return rows
    .map((row) => ({ ...row, weekStart: weekById.get(row.reviewId) ?? "" }))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}
