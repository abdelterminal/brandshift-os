import "server-only";

import { eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import { departments, sopSteps, sops, users } from "@/db/schema";
import { withOrg } from "@/db/tenancy";
import { isUuid } from "@/lib/uuid";
import type { Actor } from "@/lib/authz";
import { slugify } from "@/lib/slug";
import { compareByUrgency, reviewDueOn, reviewState, type ReviewState } from "@/lib/sops";

/**
 * Reading and writing procedures.
 *
 * The review state is worked out on read from two stored facts -- the last
 * review and the interval -- rather than being a column. Same reasoning as
 * objective health and leave balances: a derived status stored is a status
 * that goes wrong the first time anything behind it changes, and nothing says
 * so.
 */

export type SopStepView = { id: string; title: string; detail: string | null; position: number };

export type SopView = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: "draft" | "published" | "retired";
  departmentId: string | null;
  departmentName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  reviewIntervalDays: number;
  lastReviewedOn: string | null;
  lastReviewedByName: string | null;
  reviewDueOn: string | null;
  state: ReviewState;
  createdAt: Date;
  steps: SopStepView[];
};

/**
 * The same `users` table twice: once for the owner, once for whoever last
 * confirmed the procedure is still right. They are usually different people,
 * and "reviewed in March by Elena" answers the question somebody opening a
 * procedure actually has in a way a bare date does not.
 */
const reviewer = alias(users, "reviewer");

const SOP_FIELDS = {
  id: sops.id,
  slug: sops.slug,
  title: sops.title,
  summary: sops.summary,
  status: sops.status,
  departmentId: sops.departmentId,
  departmentName: departments.name,
  ownerUserId: sops.ownerUserId,
  ownerName: users.name,
  reviewIntervalDays: sops.reviewIntervalDays,
  lastReviewedOn: sops.lastReviewedOn,
  lastReviewedByName: reviewer.name,
  createdAt: sops.createdAt,
};

const SOP_JOINS = [
  { table: users, on: eq(sops.ownerUserId, users.id), type: "left" as const },
  { table: departments, on: eq(sops.departmentId, departments.id), type: "left" as const },
  { table: reviewer, on: eq(sops.lastReviewedByUserId, reviewer.id), type: "left" as const },
];

/** Attach the steps and the derived review state to a set of rows. */
async function decorate(
  actor: Actor,
  rows: Array<{
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    status: SopView["status"];
    departmentId: string | null;
    departmentName: string | null;
    ownerUserId: string | null;
    ownerName: string | null;
    reviewIntervalDays: number;
    lastReviewedOn: string | null;
    lastReviewedByName: string | null;
    createdAt: Date;
  }>,
  today: string,
  withSteps: boolean,
): Promise<SopView[]> {
  if (rows.length === 0) return [];

  const steps = withSteps
    ? await withOrg(actor.organizationId).select(
        sopSteps,
        inArray(
          sopSteps.sopId,
          rows.map((row) => row.id),
        ),
      )
    : [];

  return rows
    .map((row) => ({
      ...row,
      reviewDueOn: reviewDueOn(row.lastReviewedOn, row.reviewIntervalDays),
      state: reviewState(row.lastReviewedOn, row.reviewIntervalDays, today),
      steps: steps
        .filter((step) => step.sopId === row.id)
        .sort((a, b) => a.position - b.position)
        .map((step) => ({
          id: step.id,
          title: step.title,
          detail: step.detail,
          position: step.position,
        })),
    }))
    .sort(compareByUrgency);
}

/**
 * The library, worst first.
 *
 * Retired procedures are left out: they are kept so somebody can point at how
 * the work used to be done, not so they can clutter the list of how it is done
 * now. `listRetiredSops` exists for when somebody wants them.
 */
export async function listSops(actor: Actor, today: string): Promise<SopView[]> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    sops,
    SOP_FIELDS,
    SOP_JOINS,
    ne(sops.status, "retired"),
  );

  return decorate(actor, rows, today, false);
}

export async function listRetiredSops(actor: Actor, today: string): Promise<SopView[]> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    sops,
    SOP_FIELDS,
    SOP_JOINS,
    eq(sops.status, "retired"),
  );

  return decorate(actor, rows, today, false);
}

export async function getSop(actor: Actor, slug: string, today: string): Promise<SopView | null> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    sops,
    SOP_FIELDS,
    SOP_JOINS,
    eq(sops.slug, slug),
  );

  const [view] = await decorate(actor, rows, today, true);
  return view ?? null;
}

/** How many need somebody to look at them. For Today and for Insights. */
export async function sopSummary(actor: Actor, today: string) {
  const all = await listSops(actor, today);

  return {
    total: all.length,
    overdue: all.filter((sop) => sop.state === "overdue").length,
    never: all.filter((sop) => sop.state === "never").length,
    dueSoon: all.filter((sop) => sop.state === "due_soon").length,
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type StepInput = { title: string; detail: string | null };

/**
 * A unique slug within the organization.
 *
 * The unique index would refuse a duplicate anyway; this makes the second
 * "Client onboarding" land as `client-onboarding-2` rather than as an error
 * somebody has to interpret.
 */
async function uniqueSlug(actor: Actor, title: string): Promise<string> {
  const base = slugify(title, "sop");
  const existing = await withOrg(actor.organizationId).selectFields(sops, { slug: sops.slug });
  const taken = new Set(existing.map((row) => row.slug));

  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  throw new Error(`Could not find a free slug for "${title}"`);
}

export async function createSop(
  actor: Actor,
  input: {
    title: string;
    summary: string | null;
    departmentId: string | null;
    ownerUserId: string | null;
    reviewIntervalDays: number;
    steps: StepInput[];
  },
): Promise<{ id: string; slug: string } | null> {
  const slug = await uniqueSlug(actor, input.title);

  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [created] = await scope.insert(sops, {
      slug,
      title: input.title,
      summary: input.summary,
      departmentId: input.departmentId,
      ownerUserId: input.ownerUserId,
      reviewIntervalDays: input.reviewIntervalDays,
      createdByUserId: actor.userId,
    });

    if (!created) return null;

    if (input.steps.length > 0) {
      await scope.insert(
        sopSteps,
        input.steps.map((step, index) => ({
          sopId: created.id,
          position: index,
          title: step.title,
          detail: step.detail,
        })),
      );
    }

    return { id: created.id, slug: created.slug };
  });
}

/**
 * Replace the steps.
 *
 * Wholesale rather than a diff: the editor hands back the list as it now
 * stands, and matching rows up by position to preserve ids would buy nothing
 * -- nothing points at a step yet. When Templates starts turning steps into
 * tasks, this becomes a real diff, and the comment is here so that is a
 * deliberate change rather than a surprise.
 */
export async function replaceSteps(
  actor: Actor,
  sopId: string,
  steps: StepInput[],
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [sop] = await scope.select(sops, eq(sops.id, sopId));
    if (!sop) return false;

    await scope.delete(sopSteps, eq(sopSteps.sopId, sopId));

    if (steps.length > 0) {
      await scope.insert(
        sopSteps,
        steps.map((step, index) => ({
          sopId,
          position: index,
          title: step.title,
          detail: step.detail,
        })),
      );
    }

    await scope.update(sops, { updatedAt: new Date() }, eq(sops.id, sopId));
    return true;
  });
}

/**
 * "I have read this and it is still right."
 *
 * One click, and it stamps the day and the person. That is the whole review
 * ritual, on purpose: an approval workflow with two signatures is one nobody
 * completes, and then every procedure in the library is permanently overdue.
 */
export async function markReviewed(actor: Actor, sopId: string, today: string): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    sops,
    {
      lastReviewedOn: today,
      lastReviewedByUserId: actor.userId,
      updatedAt: new Date(),
    },
    eq(sops.id, sopId),
  );

  return updated.length > 0;
}

export async function setSopStatus(
  actor: Actor,
  sopId: string,
  status: "draft" | "published" | "retired",
): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    sops,
    { status, updatedAt: new Date() },
    eq(sops.id, sopId),
    ne(sops.status, status),
  );

  return updated.length > 0;
}

export async function getSopById(actor: Actor, sopId: string) {
  // A malformed id is a missing row, not a server error -- see `isUuid`.
  if (!isUuid(sopId)) return null;

  const [row] = await withOrg(actor.organizationId).select(sops, eq(sops.id, sopId));
  return row ?? null;
}
