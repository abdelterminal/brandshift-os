"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  createSop,
  getSopById,
  markReviewed,
  replaceSteps,
  setSopStatus,
  type StepInput,
} from "@/lib/data/sops";

/**
 * Writing down how the work is done.
 *
 * The only unusual rule here is who may mark a procedure reviewed: its owner,
 * or anybody who can manage the library. Requiring a manager to confirm every
 * six-month check is how a review queue becomes permanently overdue, and an
 * overdue queue nobody can clear is worse than no queue at all.
 */

export type ActionResult = { ok: true; id?: string; slug?: string } | { ok: false; error: string };

const stepSchema = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(4000).optional(),
});

function toSteps(raw: z.infer<typeof stepSchema>[]): StepInput[] {
  return raw.map((step) => ({ title: step.title, detail: step.detail || null }));
}

async function revalidateSops() {
  revalidatePath(`/${await getLocale()}`, "layout");
}

const sopSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  departmentId: z.union([z.uuid(), z.literal("")]).optional(),
  ownerUserId: z.union([z.uuid(), z.literal("")]).optional(),
  // A day to five years. Anything outside that is a typo, and an interval of
  // nought would make the procedure permanently overdue the moment it is read.
  reviewIntervalDays: z.coerce.number().int().min(1).max(1825),
  steps: z.array(stepSchema).min(1).max(50),
});

export async function addSop(input: z.input<typeof sopSchema>): Promise<ActionResult> {
  const parsed = sopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("sop.manage");

  const created = await createSop(session.actor, {
    title: parsed.data.title,
    summary: parsed.data.summary || null,
    departmentId: parsed.data.departmentId || null,
    ownerUserId: parsed.data.ownerUserId || null,
    reviewIntervalDays: parsed.data.reviewIntervalDays,
    steps: toSteps(parsed.data.steps),
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "sop.created",
    subjectType: "sop",
    subjectId: created.id,
    metadata: { title: parsed.data.title },
  });

  const locale = await getLocale();
  await revalidateSops();
  redirect(`/${locale}/sops/${created.slug}`);
}

const stepsSchema = z.object({
  sopId: z.uuid(),
  steps: z.array(stepSchema).min(1).max(50),
});

export async function updateSteps(input: z.input<typeof stepsSchema>): Promise<ActionResult> {
  const parsed = stepsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("sop.manage");

  const done = await replaceSteps(session.actor, parsed.data.sopId, toSteps(parsed.data.steps));
  if (!done) return { ok: false, error: "notFound" };

  await revalidateSops();
  return { ok: true };
}

/**
 * Mark it read and still correct.
 *
 * Checked against the SOP itself, so an owner can review their own procedure
 * without holding the manage permission -- the resource form of `can()`, the
 * same shape leave approval uses.
 */
export async function confirmReviewed(sopId: string, today: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(sopId);
  const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(today);
  if (!id.success || !day.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("sop.view");

  const sop = await getSopById(session.actor, id.data);
  if (!sop) return { ok: false, error: "notFound" };

  const { can } = await import("@/lib/authz");
  if (!can(session.actor, "sop.review", { ownerUserId: sop.ownerUserId ?? undefined })) {
    return { ok: false, error: "forbidden" };
  }

  const done = await markReviewed(session.actor, id.data, day.data);
  if (!done) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "sop.reviewed",
    subjectType: "sop",
    subjectId: id.data,
    metadata: { title: sop.title },
  });

  await revalidateSops();
  return { ok: true };
}

const statusSchema = z.object({
  sopId: z.uuid(),
  status: z.enum(["draft", "published", "retired"]),
});

export async function moveSop(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("sop.manage");

  const sop = await getSopById(session.actor, parsed.data.sopId);
  if (!sop) return { ok: false, error: "notFound" };

  const moved = await setSopStatus(session.actor, parsed.data.sopId, parsed.data.status);
  if (!moved) return { ok: false, error: "alreadyThere" };

  await recordActivity(session.actor, {
    verb: `sop.${parsed.data.status}`,
    subjectType: "sop",
    subjectId: parsed.data.sopId,
    metadata: { title: sop.title },
  });

  await revalidateSops();
  return { ok: true };
}
