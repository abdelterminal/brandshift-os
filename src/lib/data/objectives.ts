import "server-only";

import { eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";

import { departments, keyResultCheckpoints, keyResults, objectives, users } from "@/db/schema";
import { withOrg } from "@/db/tenancy";
import type { Actor } from "@/lib/authz";
import {
  elapsedFraction,
  health,
  isMet,
  objectiveProgress,
  progressFraction,
  type Direction,
  type Health,
  type KeyResultUnit,
} from "@/lib/objectives";

/**
 * Reading and writing goals.
 *
 * Nothing here stores a progress figure or a status. Both are worked out on
 * read, from checkpoints somebody entered against dates somebody chose --
 * which is what lets the objectives screen obey the rule that no number on it
 * was invented by the app.
 *
 * The cost of that is one extra query per read (the latest checkpoint per key
 * result) and it is bounded: an agency runs a handful of objectives a quarter,
 * each with three or four key results. If that ever stops being true this
 * becomes a lateral join, behind the same function shape.
 */

export type KeyResultView = {
  id: string;
  title: string;
  unit: KeyResultUnit;
  direction: Direction;
  startValue: number;
  targetValue: number;
  /** The latest checkpoint's value, or `null` when nobody has measured yet. */
  currentValue: number | null;
  measuredOn: string | null;
  progress: number | null;
  met: boolean;
};

export type ObjectiveView = {
  id: string;
  title: string;
  description: string | null;
  periodStart: string;
  periodEnd: string;
  ownerUserId: string | null;
  ownerName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  outcome: "achieved" | "partly" | "missed" | "abandoned" | null;
  closingNote: string | null;
  closedAt: Date | null;
  keyResults: KeyResultView[];
  progress: number | null;
  elapsed: number;
  health: Health;
};

/** Postgres `date` columns come back as `YYYY-MM-DD`; read them as local days. */
function asDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * The latest checkpoint for each of these key results.
 *
 * The obvious query is `DISTINCT ON`, and the first version of this used it --
 * which meant reaching for `db` directly, because the scoped helpers do not
 * expose it. The tenancy guard refused that, correctly: the query did filter by
 * organization, but the rule exists so nobody has to read it to find out.
 *
 * So the rows come back scoped and the reduction happens here. A key result
 * measured weekly for a year is fifty-two rows; a whole quarter's objectives
 * are a few hundred. If that ever stops being true, the fix is a
 * `selectDistinctOn` on the tenancy helper rather than an exception to it.
 *
 * Latest wins, and on a tie the row written last wins -- a correction should
 * beat the figure it corrects.
 */
async function latestCheckpoints(
  organizationId: string,
  keyResultIds: string[],
): Promise<Map<string, { value: number; recordedOn: string }>> {
  if (keyResultIds.length === 0) return new Map();

  const rows = await withOrg(organizationId).select(
    keyResultCheckpoints,
    inArray(keyResultCheckpoints.keyResultId, keyResultIds),
  );

  const latest = new Map<string, { value: number; recordedOn: string; createdAt: Date }>();

  for (const row of rows) {
    const held = latest.get(row.keyResultId);
    const newer =
      !held ||
      row.recordedOn > held.recordedOn ||
      (row.recordedOn === held.recordedOn && row.createdAt > held.createdAt);

    if (newer) {
      latest.set(row.keyResultId, {
        value: row.value,
        recordedOn: row.recordedOn,
        createdAt: row.createdAt,
      });
    }
  }

  return new Map(
    [...latest].map(([id, entry]) => [id, { value: entry.value, recordedOn: entry.recordedOn }]),
  );
}

/** Assemble the derived view for a set of objective rows. */
async function withProgress(
  actor: Actor,
  rows: Array<{
    id: string;
    title: string;
    description: string | null;
    periodStart: string;
    periodEnd: string;
    ownerUserId: string | null;
    ownerName: string | null;
    departmentId: string | null;
    departmentName: string | null;
    outcome: ObjectiveView["outcome"];
    closingNote: string | null;
    closedAt: Date | null;
  }>,
  today: Date,
): Promise<ObjectiveView[]> {
  if (rows.length === 0) return [];

  const scope = withOrg(actor.organizationId);

  // The scoped helpers resolve immediately -- there is no builder to chain
  // `orderBy` onto. Ordering happens in memory, as it does everywhere else
  // here: this is a handful of rows per quarter.
  const krRows = (
    await scope.select(
      keyResults,
      inArray(
        keyResults.objectiveId,
        rows.map((row) => row.id),
      ),
    )
  ).sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());

  const latest = await latestCheckpoints(
    actor.organizationId,
    krRows.map((row) => row.id),
  );

  return rows.map((row) => {
    const mine = krRows
      .filter((kr) => kr.objectiveId === row.id)
      .map((kr): KeyResultView => {
        const measured = latest.get(kr.id) ?? null;
        const currentValue = measured?.value ?? null;

        return {
          id: kr.id,
          title: kr.title,
          unit: kr.unit as KeyResultUnit,
          direction: kr.direction as Direction,
          startValue: kr.startValue,
          targetValue: kr.targetValue,
          currentValue,
          measuredOn: measured?.recordedOn ?? null,
          progress: progressFraction(kr.startValue, kr.targetValue, currentValue),
          met: isMet(kr.targetValue, currentValue, kr.direction as Direction),
        };
      });

    const progress = objectiveProgress(mine.map((kr) => kr.progress));
    const elapsed = elapsedFraction(asDate(row.periodStart), asDate(row.periodEnd), today);

    return {
      ...row,
      keyResults: mine,
      progress,
      elapsed,
      // A closed objective is history: it is reported by its outcome, not by a
      // health band that would keep judging it after everyone stopped caring.
      health: row.closedAt ? "done" : health(progress, elapsed),
    };
  });
}

const OBJECTIVE_FIELDS = {
  id: objectives.id,
  title: objectives.title,
  description: objectives.description,
  periodStart: objectives.periodStart,
  periodEnd: objectives.periodEnd,
  ownerUserId: objectives.ownerUserId,
  ownerName: users.name,
  departmentId: objectives.departmentId,
  departmentName: departments.name,
  outcome: objectives.outcome,
  closingNote: objectives.closingNote,
  closedAt: objectives.closedAt,
};

const OBJECTIVE_JOINS = [
  { table: users, on: eq(objectives.ownerUserId, users.id), type: "left" as const },
  { table: departments, on: eq(objectives.departmentId, departments.id), type: "left" as const },
];

/**
 * Everything currently being steered by.
 *
 * "Open" means not closed and not finished — an objective whose quarter ended
 * last week is still open until somebody says how it went, and that is
 * deliberate: it keeps the unclosed ones in front of people rather than
 * letting them slide off the screen unexamined.
 */
export async function listOpenObjectives(
  actor: Actor,
  today = new Date(),
): Promise<ObjectiveView[]> {
  const rows = (
    await withOrg(actor.organizationId).selectJoined(
      objectives,
      OBJECTIVE_FIELDS,
      OBJECTIVE_JOINS,
      isNull(objectives.closedAt),
    )
  ).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.title.localeCompare(b.title));

  return withProgress(actor, rows, today);
}

/** The ones already answered for, most recently closed first. */
export async function listClosedObjectives(
  actor: Actor,
  limit = 20,
  today = new Date(),
): Promise<ObjectiveView[]> {
  const rows = (
    await withOrg(actor.organizationId).selectJoined(
      objectives,
      OBJECTIVE_FIELDS,
      OBJECTIVE_JOINS,
      sql`${objectives.closedAt} is not null`,
    )
  )
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
    .slice(0, limit);

  return withProgress(actor, rows, today);
}

export async function getObjective(
  actor: Actor,
  objectiveId: string,
  today = new Date(),
): Promise<ObjectiveView | null> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    objectives,
    OBJECTIVE_FIELDS,
    OBJECTIVE_JOINS,
    eq(objectives.id, objectiveId),
  );

  const [view] = await withProgress(actor, rows, today);
  return view ?? null;
}

/** A key result's history, newest first. The audit trail behind the number. */
export async function listCheckpoints(actor: Actor, keyResultId: string) {
  const rows = await withOrg(actor.organizationId).selectJoined(
    keyResultCheckpoints,
    {
      id: keyResultCheckpoints.id,
      value: keyResultCheckpoints.value,
      recordedOn: keyResultCheckpoints.recordedOn,
      note: keyResultCheckpoints.note,
      recordedByUserId: keyResultCheckpoints.recordedByUserId,
      recordedByName: users.name,
      createdAt: keyResultCheckpoints.createdAt,
    },
    [{ table: users, on: eq(keyResultCheckpoints.recordedByUserId, users.id), type: "left" }],
    eq(keyResultCheckpoints.keyResultId, keyResultId),
  );

  // Newest first, and a correction written later on the same day wins.
  return rows.sort(
    (a, b) =>
      b.recordedOn.localeCompare(a.recordedOn) || b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function getKeyResult(actor: Actor, keyResultId: string) {
  const [row] = await withOrg(actor.organizationId).select(
    keyResults,
    eq(keyResults.id, keyResultId),
  );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type NewKeyResultInput = {
  title: string;
  unit: KeyResultUnit;
  direction: Direction;
  startValue: number;
  targetValue: number;
};

/**
 * An objective and its key results, in one transaction.
 *
 * Both or neither: an objective with no way to tell whether it happened is
 * exactly the vague aspiration this screen exists to replace.
 */
export async function createObjective(
  actor: Actor,
  input: {
    title: string;
    description: string | null;
    periodStart: string;
    periodEnd: string;
    ownerUserId: string | null;
    departmentId: string | null;
    keyResults: NewKeyResultInput[];
  },
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [created] = await scope.insert(objectives, {
      title: input.title,
      description: input.description,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      ownerUserId: input.ownerUserId,
      departmentId: input.departmentId,
      createdByUserId: actor.userId,
    });

    if (!created) return null;

    if (input.keyResults.length > 0) {
      await scope.insert(
        keyResults,
        input.keyResults.map((kr, index) => ({
          objectiveId: created.id,
          title: kr.title,
          unit: kr.unit,
          direction: kr.direction,
          startValue: kr.startValue,
          targetValue: kr.targetValue,
          position: index,
        })),
      );
    }

    return { id: created.id };
  });
}

/**
 * Write down what the number is today.
 *
 * A checkpoint is never an update of the last one. Two figures for the same
 * day both stay, and the later-written wins on read -- a correction should
 * beat the figure it corrects without erasing that the correction happened.
 */
export async function recordCheckpoint(
  actor: Actor,
  input: { keyResultId: string; value: number; recordedOn: string; note: string | null },
): Promise<{ id: string } | null> {
  const keyResult = await getKeyResult(actor, input.keyResultId);
  if (!keyResult) return null;

  const [created] = await withOrg(actor.organizationId).insert(keyResultCheckpoints, {
    keyResultId: input.keyResultId,
    value: input.value,
    recordedOn: input.recordedOn,
    note: input.note,
    recordedByUserId: actor.userId,
  });

  return created ?? null;
}

/** Say how it went. Closing is deliberate and it is the only way one ends. */
export async function closeObjective(
  actor: Actor,
  input: {
    objectiveId: string;
    outcome: "achieved" | "partly" | "missed" | "abandoned";
    closingNote: string | null;
  },
): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    objectives,
    {
      outcome: input.outcome,
      closingNote: input.closingNote,
      closedAt: new Date(),
      closedByUserId: actor.userId,
      updatedAt: new Date(),
    },
    eq(objectives.id, input.objectiveId),
    isNull(objectives.closedAt),
  );

  return updated.length > 0;
}

/** Re-open one that was closed by mistake. */
export async function reopenObjective(actor: Actor, objectiveId: string): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    objectives,
    {
      outcome: null,
      closingNote: null,
      closedAt: null,
      closedByUserId: null,
      updatedAt: new Date(),
    },
    eq(objectives.id, objectiveId),
    sql`${objectives.closedAt} is not null`,
  );

  return updated.length > 0;
}

/**
 * The one-line summary the Insights screen shows.
 *
 * Counts of real objectives in real states -- not a score. There is no
 * "company health index" here and there will not be one: a single number that
 * blends unrelated goals is the definition of an invented metric.
 */
export async function objectiveSummary(actor: Actor, today = new Date()) {
  const open = await listOpenObjectives(actor, today);

  return {
    open: open.length,
    behind: open.filter((objective) => objective.health === "behind").length,
    atRisk: open.filter((objective) => objective.health === "at_risk").length,
    notMeasured: open.filter((objective) => objective.health === "not_measured").length,
    /** Ended, and nobody has said how it went. These are the ones that rot. */
    awaitingClose: open.filter((objective) => asDate(objective.periodEnd) < today).length,
  };
}

/** Objectives whose period has ended and which nobody has closed. */
export async function unclosedPastObjectives(actor: Actor, today = new Date()) {
  const rows = (
    await withOrg(actor.organizationId).selectJoined(
      objectives,
      OBJECTIVE_FIELDS,
      OBJECTIVE_JOINS,
      isNull(objectives.closedAt),
      lte(objectives.periodEnd, today.toISOString().slice(0, 10)),
    )
  ).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  return withProgress(actor, rows, today);
}
