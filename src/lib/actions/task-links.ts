"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUserForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import { mayWorkOn } from "@/lib/data/project-access";
import { getTask } from "@/lib/data/tasks";
import {
  createTaskLink,
  deleteTaskLink,
  getTaskLink,
  linkableTasksInProject,
  linkablePair,
  listTaskLinks,
  markNudged,
  nudgeReady,
  reverseLinkExists,
  type TaskChoice,
  type TaskLinks,
} from "@/lib/data/task-links";

/**
 * The handoff link.
 *
 * Declaring "my task is waiting on that one" is for the person who is waiting
 * -- the assignee of the blocked task -- or a manager. The nudge that follows
 * is the same audience: you can only chase a handoff you are actually stuck
 * behind. Both are rate-limited by `last_nudged_at` so a reminder stays a
 * reminder.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const idSchema = z.uuid();

function revalidateTaskViews() {
  revalidatePath("/[locale]/today", "page");
  revalidatePath("/[locale]/work", "page");
  revalidatePath("/[locale]/work/[key]", "page");
}

/** The links for one task, for the drawer. Open to anyone who can see the task. */
export async function taskLinksFor(taskId: string): Promise<ActionResult<TaskLinks>> {
  const parsed = idSchema.safeParse(taskId);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requireUserForAction();
  const task = await getTask(session.actor, parsed.data);
  if (!task) return { ok: false, error: "notFound" };

  return { ok: true, data: await listTaskLinks(session.actor, parsed.data) };
}

/** The tasks the picker offers -- this task's project, minus itself. */
export async function linkChoicesFor(taskId: string): Promise<ActionResult<TaskChoice[]>> {
  const parsed = idSchema.safeParse(taskId);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requireUserForAction();
  const task = await getTask(session.actor, parsed.data);
  if (!task) return { ok: false, error: "notFound" };
  if (!task.projectId) return { ok: true, data: [] };
  if (!(await mayWorkOn(session.actor, task))) return { ok: false, error: "forbidden" };

  return { ok: true, data: await linkableTasksInProject(session.actor, task.projectId, parsed.data) };
}

const linkSchema = z.object({ blockedTaskId: idSchema, blockingTaskId: idSchema });

/** `blockedTaskId` is waiting on `blockingTaskId`. */
export async function linkTask(input: z.input<typeof linkSchema>): Promise<ActionResult> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { blockedTaskId, blockingTaskId } = parsed.data;

  const session = await requireUserForAction();

  const blocked = await getTask(session.actor, blockedTaskId);
  if (!blocked) return { ok: false, error: "notFound" };
  if (!(await mayWorkOn(session.actor, blocked))) return { ok: false, error: "forbidden" };

  const pair = await linkablePair(session.actor, blockedTaskId, blockingTaskId);
  if (!pair) return { ok: false, error: "notLinkable" };
  if (await reverseLinkExists(session.actor, blockedTaskId, blockingTaskId)) {
    return { ok: false, error: "wouldCycle" };
  }

  const created = await createTaskLink(session.actor, blockedTaskId, blockingTaskId);
  if (!created) return { ok: false, error: "invalid" };

  revalidateTaskViews();
  return { ok: true };
}

export async function unlinkTask(linkId: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(linkId);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requireUserForAction();
  const link = await getTaskLink(session.actor, parsed.data);
  if (!link) return { ok: false, error: "notFound" };

  const blocked = await getTask(session.actor, link.blockedTaskId);
  if (blocked && !(await mayWorkOn(session.actor, blocked))) {
    return { ok: false, error: "forbidden" };
  }

  await deleteTaskLink(session.actor, parsed.data);
  revalidateTaskViews();
  return { ok: true };
}

/** Remind the upstream assignee that this handoff is holding something up. */
export async function nudgeLink(linkId: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(linkId);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requireUserForAction();
  const link = await getTaskLink(session.actor, parsed.data);
  if (!link) return { ok: false, error: "notFound" };

  const [blocked, blocking] = await Promise.all([
    getTask(session.actor, link.blockedTaskId),
    getTask(session.actor, link.blockingTaskId),
  ]);
  if (!blocked || !blocking) return { ok: false, error: "notFound" };
  if (!(await mayWorkOn(session.actor, blocked))) return { ok: false, error: "forbidden" };
  if (blocking.status === "done") return { ok: false, error: "alreadyDone" };
  if (!nudgeReady(link.lastNudgedAt)) return { ok: false, error: "tooSoon" };

  await markNudged(session.actor, parsed.data);

  await recordActivity(session.actor, {
    verb: "task.nudged",
    subjectType: "task",
    subjectId: blocking.id,
    projectId: blocking.projectId,
    taskId: blocking.id,
    metadata: {
      // Whoever is actually stuck behind the handoff -- the person on the
      // waiting task, or the nudger if it is unassigned.
      waitingUserName: blocked.assigneeName ?? session.user.name,
      waitingTaskTitle: blocked.title,
      blockingTaskTitle: blocking.title,
    },
  });

  revalidateTaskViews();
  return { ok: true };
}
