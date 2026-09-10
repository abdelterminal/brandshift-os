import "server-only";

import { eq, inArray } from "drizzle-orm";

import { taskLinks } from "@/db/schema/task-links";
import { tasks } from "@/db/schema/tasks";
import { users } from "@/db/schema/people";
import { withOrg, type Executor } from "@/db/tenancy";

import type { Actor } from "../authz";
import type { TaskStatus } from "./task-types";

/**
 * The handoff graph, one hop out.
 *
 * A task's `upstream` is what it is waiting on; its `downstream` is what is
 * waiting on it. Each linked task is reported as a title, a status and a name
 * -- the whole of what crosses the member silo -- plus `lastNudgedAt` so the
 * drawer can decide whether the Nudge button is available again.
 */

export type LinkedTask = {
  linkId: string;
  taskId: string;
  title: string;
  status: TaskStatus;
  assigneeUserId: string | null;
  assigneeName: string | null;
  lastNudgedAt: Date | null;
};

export type TaskLinks = { upstream: LinkedTask[]; downstream: LinkedTask[] };

const LINKED_FIELDS = {
  linkId: taskLinks.id,
  taskId: tasks.id,
  title: tasks.title,
  status: tasks.status,
  assigneeUserId: tasks.assigneeUserId,
  assigneeName: users.name,
  lastNudgedAt: taskLinks.lastNudgedAt,
};

export async function listTaskLinks(
  actor: Actor,
  taskId: string,
  executor?: Executor,
): Promise<TaskLinks> {
  const scope = withOrg(actor.organizationId, executor);

  const [upstream, downstream] = await Promise.all([
    scope.selectJoined(
      taskLinks,
      LINKED_FIELDS,
      [
        { table: tasks, on: eq(tasks.id, taskLinks.blockingTaskId), type: "inner" as const },
        { table: users, on: eq(users.id, tasks.assigneeUserId), type: "left" as const },
      ],
      eq(taskLinks.blockedTaskId, taskId),
    ) as Promise<LinkedTask[]>,
    scope.selectJoined(
      taskLinks,
      LINKED_FIELDS,
      [
        { table: tasks, on: eq(tasks.id, taskLinks.blockedTaskId), type: "inner" as const },
        { table: users, on: eq(users.id, tasks.assigneeUserId), type: "left" as const },
      ],
      eq(taskLinks.blockingTaskId, taskId),
    ) as Promise<LinkedTask[]>,
  ]);

  const byTitle = (a: LinkedTask, b: LinkedTask) => a.title.localeCompare(b.title);
  return { upstream: upstream.sort(byTitle), downstream: downstream.sort(byTitle) };
}

/** The assignees of every task that `taskId` is blocking -- for `task.completed` fan-out. */
export async function downstreamAssignees(
  actor: Actor,
  taskId: string,
  executor?: Executor,
): Promise<string[]> {
  const rows = await withOrg(actor.organizationId, executor).selectJoined(
    taskLinks,
    { assigneeUserId: tasks.assigneeUserId },
    [{ table: tasks, on: eq(tasks.id, taskLinks.blockedTaskId), type: "inner" as const }],
    eq(taskLinks.blockingTaskId, taskId),
  );
  return [...new Set(rows.map((row) => row.assigneeUserId).filter((id): id is string => id != null))];
}

/** One link by id, with both tasks' project and title, for an action to act on. */
export async function getTaskLink(actor: Actor, linkId: string, executor?: Executor) {
  const [row] = await withOrg(actor.organizationId, executor).select(
    taskLinks,
    eq(taskLinks.id, linkId),
  );
  return row ?? null;
}

/**
 * Both tasks, checked to exist in the org and to share a project. Returns the
 * shared project id, or null if the pair is not linkable.
 */
export async function linkablePair(
  actor: Actor,
  blockedTaskId: string,
  blockingTaskId: string,
  executor?: Executor,
): Promise<{ projectId: string } | null> {
  if (blockedTaskId === blockingTaskId) return null;

  const rows = await withOrg(actor.organizationId, executor).selectFields(
    tasks,
    { id: tasks.id, projectId: tasks.projectId },
    inArray(tasks.id, [blockedTaskId, blockingTaskId]),
  );
  if (rows.length !== 2) return null;

  const [a, b] = rows;
  if (!a!.projectId || a!.projectId !== b!.projectId) return null;
  return { projectId: a!.projectId };
}

/** True if `(blockingTaskId, blockedTaskId)` already exists -- the reverse link. */
export async function reverseLinkExists(
  actor: Actor,
  blockedTaskId: string,
  blockingTaskId: string,
  executor?: Executor,
): Promise<boolean> {
  const [row] = await withOrg(actor.organizationId, executor).selectFields(
    taskLinks,
    { id: taskLinks.id },
    eq(taskLinks.blockedTaskId, blockingTaskId),
    eq(taskLinks.blockingTaskId, blockedTaskId),
  );
  return row != null;
}

/** How long a nudge waits before it can be sent again. */
export const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/** Whether a link may be nudged now, given when it last was. */
export function nudgeReady(lastNudgedAt: Date | null, now = new Date()): boolean {
  return lastNudgedAt == null || now.getTime() - lastNudgedAt.getTime() >= NUDGE_COOLDOWN_MS;
}

export async function createTaskLink(
  actor: Actor,
  blockedTaskId: string,
  blockingTaskId: string,
  executor?: Executor,
): Promise<{ id: string } | null> {
  const [created] = await withOrg(actor.organizationId, executor).insert(taskLinks, {
    blockedTaskId,
    blockingTaskId,
    createdByUserId: actor.userId,
  });
  return created ? { id: created.id } : null;
}

export async function deleteTaskLink(
  actor: Actor,
  linkId: string,
  executor?: Executor,
): Promise<boolean> {
  const rows = await withOrg(actor.organizationId, executor).delete(
    taskLinks,
    eq(taskLinks.id, linkId),
  );
  return rows.length > 0;
}

export async function markNudged(
  actor: Actor,
  linkId: string,
  executor?: Executor,
): Promise<void> {
  await withOrg(actor.organizationId, executor).update(
    taskLinks,
    { lastNudgedAt: new Date() },
    eq(taskLinks.id, linkId),
  );
}

/** The tasks a member may choose from when adding a link: a project's own, title + assignee only. */
export type TaskChoice = { id: string; title: string; assigneeName: string | null };

export async function linkableTasksInProject(
  actor: Actor,
  projectId: string,
  excludeTaskId: string,
): Promise<TaskChoice[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    tasks,
    { id: tasks.id, title: tasks.title, assigneeName: users.name },
    [{ table: users, on: eq(users.id, tasks.assigneeUserId), type: "left" as const }],
    eq(tasks.projectId, projectId),
  )) as TaskChoice[];

  return rows
    .filter((row) => row.id !== excludeTaskId)
    .sort((a, b) => a.title.localeCompare(b.title));
}
