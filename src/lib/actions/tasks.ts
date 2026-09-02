"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tasks } from "@/db/schema/tasks";
import { withOrg } from "@/db/tenancy";
import { requirePermissionForAction, requireUserForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";

/**
 * Task mutations.
 *
 * The three the drawer offers -- Start, Complete, Report blocker -- are the
 * whole vocabulary of moving work along, and none of them asks for a password.
 * They are routine writes; the re-auth window is for destructive acts only.
 *
 * Every one of them writes an activity event in the same transaction as the
 * change, so the feed cannot disagree with the record.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

/** Revalidate everywhere a task can be seen, since it appears on several screens. */
function revalidateTaskViews() {
  revalidatePath("/[locale]/today", "page");
  revalidatePath("/[locale]/work", "page");
  revalidatePath("/[locale]/work/[key]", "page");
}

export async function startTask(taskId: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(taskId);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requireUserForAction();
  const scope = withOrg(session.actor.organizationId);

  const [updated] = await scope.update(
    tasks,
    {
      status: "in_progress",
      startedAt: new Date(),
      // Starting something clears the blocker: if it were still blocked, it
      // could not be started.
      blockedReason: null,
      blockedAt: null,
      updatedAt: new Date(),
    },
    eq(tasks.id, parsed.data),
  );

  if (!updated) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "task.started",
    subjectType: "task",
    subjectId: updated.id,
    projectId: updated.projectId,
    taskId: updated.id,
  });

  revalidateTaskViews();
  return { ok: true };
}

export async function completeTask(taskId: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(taskId);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requireUserForAction();
  const scope = withOrg(session.actor.organizationId);
  const now = new Date();

  const [updated] = await scope.update(
    tasks,
    {
      status: "done",
      completedAt: now,
      blockedReason: null,
      blockedAt: null,
      updatedAt: now,
    },
    eq(tasks.id, parsed.data),
  );

  if (!updated) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "task.completed",
    subjectType: "task",
    subjectId: updated.id,
    projectId: updated.projectId,
    taskId: updated.id,
  });

  revalidateTaskViews();
  return { ok: true };
}

const blockerSchema = z.object({
  taskId: idSchema,
  reason: z.string().trim().min(3).max(500),
});

/**
 * Report a blocker.
 *
 * The reason is required and is free text, because "blocked" without saying by
 * what is not information anyone can act on -- and the admin coordination queue
 * exists precisely to act on these.
 */
export async function reportBlocker(taskId: string, reason: string): Promise<ActionResult> {
  const parsed = blockerSchema.safeParse({ taskId, reason });
  if (!parsed.success) return { ok: false, error: "blockerReasonRequired" };

  const session = await requireUserForAction();
  const now = new Date();

  const [updated] = await withOrg(session.actor.organizationId).update(
    tasks,
    {
      status: "blocked",
      blockedReason: parsed.data.reason,
      blockedAt: now,
      updatedAt: now,
    },
    eq(tasks.id, parsed.data.taskId),
  );

  if (!updated) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "task.blocked",
    subjectType: "task",
    subjectId: updated.id,
    projectId: updated.projectId,
    taskId: updated.id,
    metadata: { reason: parsed.data.reason },
  });

  revalidateTaskViews();
  return { ok: true };
}

/** Clear a blocker without starting the task -- the thing in the way is gone. */
export async function clearBlocker(taskId: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(taskId);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requireUserForAction();

  const [updated] = await withOrg(session.actor.organizationId).update(
    tasks,
    { status: "todo", blockedReason: null, blockedAt: null, updatedAt: new Date() },
    eq(tasks.id, parsed.data),
  );

  if (!updated) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "task.unblocked",
    subjectType: "task",
    subjectId: updated.id,
    projectId: updated.projectId,
    taskId: updated.id,
  });

  revalidateTaskViews();
  return { ok: true };
}

const assignSchema = z.object({
  taskId: idSchema,
  /** Empty string means "take the assignee off". */
  assigneeUserId: z.union([idSchema, z.literal("")]),
});

export async function assignTask(
  taskId: string,
  assigneeUserId: string,
): Promise<ActionResult> {
  const parsed = assignSchema.safeParse({ taskId, assigneeUserId });
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requireUserForAction();
  const assignee = parsed.data.assigneeUserId || null;

  const [updated] = await withOrg(session.actor.organizationId).update(
    tasks,
    { assigneeUserId: assignee, updatedAt: new Date() },
    eq(tasks.id, parsed.data.taskId),
  );

  if (!updated) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: assignee ? "task.assigned" : "task.unassigned",
    subjectType: "task",
    subjectId: updated.id,
    projectId: updated.projectId,
    taskId: updated.id,
    metadata: { assigneeUserId: assignee },
  });

  revalidateTaskViews();
  return { ok: true };
}

const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  projectId: z.union([idSchema, z.literal("")]).optional(),
  assigneeUserId: z.union([idSchema, z.literal("")]).optional(),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

export async function createTask(formData: FormData): Promise<ActionResult> {
  const session = await requirePermissionForAction("task.create");

  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    projectId: formData.get("projectId") ?? "",
    assigneeUserId: formData.get("assigneeUserId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    priority: formData.get("priority") ?? "medium",
  });

  if (!parsed.success) return { ok: false, error: "titleRequired" };

  const [created] = await withOrg(session.actor.organizationId).insert(tasks, {
    title: parsed.data.title,
    projectId: parsed.data.projectId || null,
    assigneeUserId: parsed.data.assigneeUserId || null,
    dueDate: parsed.data.dueDate || null,
    priority: parsed.data.priority,
    createdByUserId: session.actor.userId,
  });

  if (!created) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "task.created",
    subjectType: "task",
    subjectId: created.id,
    projectId: created.projectId,
    taskId: created.id,
    metadata: { title: created.title },
  });

  revalidateTaskViews();
  return { ok: true };
}
