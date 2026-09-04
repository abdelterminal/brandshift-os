"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  getReviewById,
  openReview,
  publishReview,
  saveReview,
  unpublishReview,
  type DecisionInput,
} from "@/lib/data/reviews";
import { canReview } from "@/lib/reviews";

/**
 * Holding a weekly review.
 *
 * The one rule worth stating: a week can only be reviewed once it has ended.
 * Reviewing a week with three days left in it produces a document that was out
 * of date before it was published, and a snapshot that describes nothing in
 * particular.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const openSchema = z.object({
  weekStart: dateSchema,
  heldOn: dateSchema,
  today: dateSchema,
});

export async function startReview(input: z.input<typeof openSchema>): Promise<ActionResult> {
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  if (!canReview(parsed.data.weekStart, parsed.data.today)) {
    return { ok: false, error: "weekNotOver" };
  }

  const session = await requirePermissionForAction("review.manage");

  const created = await openReview(session.actor, parsed.data.weekStart, parsed.data.heldOn);
  if (created === "exists") return { ok: false, error: "exists" };
  if (!created) return { ok: false, error: "invalid" };

  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
  redirect(`/${locale}/reviews/${parsed.data.weekStart}`);
}

const decisionSchema = z.object({
  decision: z.string().trim().min(1).max(1000),
  ownerUserId: z.union([z.uuid(), z.literal("")]).optional(),
  dueDate: z.union([dateSchema, z.literal("")]).optional(),
});

const saveSchema = z.object({
  reviewId: z.uuid(),
  highlights: z.string().trim().max(4000).optional(),
  concerns: z.string().trim().max(4000).optional(),
  decisions: z.array(decisionSchema).max(30),
});

export async function saveNotes(input: z.input<typeof saveSchema>): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("review.manage");

  const review = await getReviewById(session.actor, parsed.data.reviewId);
  if (!review) return { ok: false, error: "notFound" };

  // A published review is a record. Editing it means unpublishing it first,
  // which is a deliberate act rather than something that happens by typing.
  if (review.publishedAt) return { ok: false, error: "published" };

  const decisions: DecisionInput[] = parsed.data.decisions.map((decision) => ({
    decision: decision.decision,
    ownerUserId: decision.ownerUserId || null,
    dueDate: decision.dueDate || null,
  }));

  const done = await saveReview(session.actor, {
    reviewId: parsed.data.reviewId,
    highlights: parsed.data.highlights || null,
    concerns: parsed.data.concerns || null,
    decisions,
  });
  if (!done) return { ok: false, error: "notFound" };

  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}

export async function publish(reviewId: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(reviewId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("review.manage");

  const review = await getReviewById(session.actor, id.data);
  if (!review) return { ok: false, error: "notFound" };

  const done = await publishReview(session.actor, id.data);
  if (!done) return { ok: false, error: "alreadyThere" };

  await recordActivity(session.actor, {
    verb: "review.published",
    subjectType: "review",
    subjectId: id.data,
    metadata: { weekStart: review.weekStart },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}

export async function reopen(reviewId: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(reviewId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("review.manage");

  const done = await unpublishReview(session.actor, id.data);
  if (!done) return { ok: false, error: "alreadyThere" };

  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}
