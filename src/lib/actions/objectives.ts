"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  closeObjective,
  createObjective,
  getKeyResult,
  getObjective,
  recordCheckpoint,
  reopenObjective,
  type NewKeyResultInput,
} from "@/lib/data/objectives";
import { parseValue, type KeyResultUnit } from "@/lib/objectives";

/**
 * Setting direction, and writing down what actually happened.
 *
 * Every number arrives from a form as a string and is parsed exactly once,
 * here, into the integer scale its unit defines. Anything that is not a number
 * is refused with a message saying so -- the same rule as money, and for a
 * sharper reason: a target field that reads "about eighty percent" as zero
 * would store a goal of nothing and then report it as met.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const keyResultSchema = z.object({
  title: z.string().trim().min(1).max(200),
  unit: z.enum(["count", "percent", "currency", "days"]),
  direction: z.enum(["increase", "decrease"]),
  startValue: z.string().trim(),
  targetValue: z.string().trim(),
});

/**
 * Turn form key results into something the data layer can store.
 *
 * Returns which field was wrong rather than a boolean: "check the highlighted
 * fields" on a form with four key results and eight numbers on it is not help.
 */
function parseKeyResults(
  raw: z.infer<typeof keyResultSchema>[],
): { ok: true; keyResults: NewKeyResultInput[] } | { ok: false; error: string } {
  const keyResults: NewKeyResultInput[] = [];

  for (const kr of raw) {
    const unit = kr.unit as KeyResultUnit;

    const startValue = parseValue(kr.startValue, unit);
    if (startValue === null) return { ok: false, error: "value" };

    const targetValue = parseValue(kr.targetValue, unit);
    if (targetValue === null) return { ok: false, error: "value" };

    keyResults.push({
      title: kr.title,
      unit,
      direction: kr.direction,
      startValue,
      targetValue,
    });
  }

  if (keyResults.length === 0) return { ok: false, error: "noKeyResults" };
  return { ok: true, keyResults };
}

async function revalidateObjectives() {
  revalidatePath(`/${await getLocale()}`, "layout");
}

const objectiveSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  periodStart: dateSchema,
  periodEnd: dateSchema,
  ownerUserId: z.union([z.uuid(), z.literal("")]).optional(),
  departmentId: z.union([z.uuid(), z.literal("")]).optional(),
  keyResults: z.array(keyResultSchema).min(1).max(10),
});

export async function addObjective(input: z.input<typeof objectiveSchema>): Promise<ActionResult> {
  const parsed = objectiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  // A period that ends before it starts is a typo, and one nobody would notice
  // until every objective on the screen read as fully elapsed.
  if (parsed.data.periodEnd < parsed.data.periodStart) {
    return { ok: false, error: "period" };
  }

  const keyResults = parseKeyResults(parsed.data.keyResults);
  if (!keyResults.ok) return { ok: false, error: keyResults.error };

  const session = await requirePermissionForAction("objective.manage");

  const created = await createObjective(session.actor, {
    title: parsed.data.title,
    description: parsed.data.description || null,
    periodStart: parsed.data.periodStart,
    periodEnd: parsed.data.periodEnd,
    ownerUserId: parsed.data.ownerUserId || null,
    departmentId: parsed.data.departmentId || null,
    keyResults: keyResults.keyResults,
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "objective.created",
    subjectType: "objective",
    subjectId: created.id,
    metadata: { title: parsed.data.title },
  });

  const locale = await getLocale();
  await revalidateObjectives();
  redirect(`/${locale}/objectives/${created.id}`);
}

const checkpointSchema = z.object({
  keyResultId: z.uuid(),
  value: z.string().trim(),
  recordedOn: dateSchema,
  note: z.string().trim().max(2000).optional(),
});

/**
 * Write down what the number is.
 *
 * Open to anyone signed in, deliberately: the person who knows the figure is
 * rarely the person with permission to set direction, and requiring a manager
 * for every measurement is how this screen goes stale. The checkpoint carries
 * its author's name, so the record says who said so.
 */
export async function addCheckpoint(
  input: z.input<typeof checkpointSchema>,
): Promise<ActionResult> {
  const parsed = checkpointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("objective.record");

  const keyResult = await getKeyResult(session.actor, parsed.data.keyResultId);
  if (!keyResult) return { ok: false, error: "notFound" };

  // Parsed against the key result's own unit, which is why this happens after
  // the read rather than in the schema.
  const value = parseValue(parsed.data.value, keyResult.unit as KeyResultUnit);
  if (value === null) return { ok: false, error: "value" };

  const created = await recordCheckpoint(session.actor, {
    keyResultId: parsed.data.keyResultId,
    value,
    recordedOn: parsed.data.recordedOn,
    note: parsed.data.note || null,
  });
  if (!created) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "key_result.measured",
    subjectType: "key_result",
    subjectId: parsed.data.keyResultId,
    metadata: { title: keyResult.title },
  });

  await revalidateObjectives();
  return { ok: true, id: created.id };
}

const closeSchema = z.object({
  objectiveId: z.uuid(),
  outcome: z.enum(["achieved", "partly", "missed", "abandoned"]),
  closingNote: z.string().trim().max(4000).optional(),
});

export async function finishObjective(input: z.input<typeof closeSchema>): Promise<ActionResult> {
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("objective.manage");

  const objective = await getObjective(session.actor, parsed.data.objectiveId);
  if (!objective) return { ok: false, error: "notFound" };

  const closed = await closeObjective(session.actor, {
    objectiveId: parsed.data.objectiveId,
    outcome: parsed.data.outcome,
    closingNote: parsed.data.closingNote || null,
  });
  if (!closed) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: `objective.${parsed.data.outcome}`,
    subjectType: "objective",
    subjectId: parsed.data.objectiveId,
    metadata: { title: objective.title },
  });

  await revalidateObjectives();
  return { ok: true };
}

export async function undoClose(objectiveId: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(objectiveId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("objective.manage");

  const reopened = await reopenObjective(session.actor, id.data);
  if (!reopened) return { ok: false, error: "notFound" };

  await revalidateObjectives();
  return { ok: true };
}
