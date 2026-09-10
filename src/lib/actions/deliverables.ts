"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  convertTaskToDeliverable,
  createDeliverable,
  getDeliverableById,
  setDeliverableStatus,
  updateDeliverable,
} from "@/lib/data/deliverables";
import { PROJECT_STAGES } from "@/lib/data/pipeline-stages";
import { mayWorkOn } from "@/lib/data/project-access";
import { DELIVERABLE_STATUSES } from "@/lib/deliverables";

/**
 * Deliverable mutations.
 *
 * Producing one and walking it through its states is `deliverable.work` --
 * open to everyone, the same as `task.create`. Turning a task into a
 * deliverable is `deliverable.convert`, a manager's call: it deletes the task.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const stageField = z.union([z.enum(PROJECT_STAGES), z.literal("")]).optional();
const uuidOrEmpty = z.union([z.uuid(), z.literal("")]).optional();
const dateOrEmpty = z.union([z.iso.date(), z.literal("")]).optional();

async function revalidateApp() {
  revalidatePath(`/${await getLocale()}`, "layout");
}

const createSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional(),
  stage: stageField,
  assigneeUserId: uuidOrEmpty,
  dueDate: dateOrEmpty,
});

export async function createDeliverableAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("deliverable.work");
  if (!(await mayWorkOn(session.actor, { projectId: parsed.data.projectId, assigneeUserId: null }))) {
    return { ok: false, error: "forbidden" };
  }

  const created = await createDeliverable(session.actor, {
    projectId: parsed.data.projectId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    stage: parsed.data.stage || null,
    assigneeUserId: parsed.data.assigneeUserId || null,
    dueDate: parsed.data.dueDate || null,
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "deliverable.created",
    subjectType: "deliverable",
    subjectId: created.id,
    projectId: parsed.data.projectId,
    metadata: { title: parsed.data.title },
  });

  await revalidateApp();
  return { ok: true };
}

const updateSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional(),
  stage: stageField,
  assigneeUserId: uuidOrEmpty,
  dueDate: dateOrEmpty,
});

export async function updateDeliverableAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("deliverable.work");
  const existing = await getDeliverableById(session.actor, parsed.data.id);
  if (!existing) return { ok: false, error: "notFound" };
  if (!(await mayWorkOn(session.actor, existing))) return { ok: false, error: "forbidden" };

  const done = await updateDeliverable(session.actor, parsed.data.id, {
    title: parsed.data.title,
    description: parsed.data.description || null,
    stage: parsed.data.stage || null,
    assigneeUserId: parsed.data.assigneeUserId || null,
    dueDate: parsed.data.dueDate || null,
  });
  if (!done) return { ok: false, error: "notFound" };

  await revalidateApp();
  return { ok: true };
}

const statusSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(DELIVERABLE_STATUSES),
    feedback: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.status !== "revising" || (v.feedback && v.feedback.length > 0), {
    error: "feedbackRequired",
    path: ["feedback"],
  });

export async function setDeliverableStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message === "feedbackRequired" ? "feedbackRequired" : "invalid" };
  }

  const session = await requirePermissionForAction("deliverable.work");
  const existing = await getDeliverableById(session.actor, parsed.data.id);
  if (!existing) return { ok: false, error: "notFound" };
  if (!(await mayWorkOn(session.actor, existing))) return { ok: false, error: "forbidden" };

  const moved = await setDeliverableStatus(
    session.actor,
    parsed.data.id,
    parsed.data.status,
    parsed.data.feedback || null,
  );
  if (!moved) return { ok: false, error: "alreadyThere" };

  await recordActivity(session.actor, {
    verb: moved.to === "published" ? "deliverable.published" : "deliverable.statusChanged",
    subjectType: "deliverable",
    subjectId: parsed.data.id,
    projectId: existing.projectId,
    metadata: { title: existing.title, to: moved.to },
  });

  await revalidateApp();
  return { ok: true };
}

const convertSchema = z.object({ taskId: z.uuid(), stage: stageField });

export async function convertTaskToDeliverableAction(
  input: z.input<typeof convertSchema>,
): Promise<ActionResult> {
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("deliverable.convert");

  const result = await convertTaskToDeliverable(
    session.actor,
    parsed.data.taskId,
    parsed.data.stage || null,
  );
  if (!result) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "deliverable.convertedFromTask",
    subjectType: "deliverable",
    subjectId: result.id,
    projectId: result.projectId,
    metadata: { title: result.title },
  });

  await revalidateApp();
  return { ok: true };
}
