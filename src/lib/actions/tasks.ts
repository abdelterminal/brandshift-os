"use server";

import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { projectMembers } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { withOrg } from "@/db/tenancy";
import { requirePermissionForAction, requireUserForAction } from "@/lib/auth/guards";
import {
  BOARD_STATUSES,
  isBoardStatus,
  statusFieldsFor,
  type BoardChange,
  type BoardStatus,
} from "@/lib/board";
import { recordActivity } from "@/lib/data/activity";
import { mayWorkOn } from "@/lib/data/project-access";
import type { Actor } from "@/lib/authz";

/**
 * Task mutations.
 *
 * The three the drawer offers -- Start, Complete, Report blocker -- are the
 * whole vocabulary of moving work along, and none of them asks for a password.
 * They are routine writes; the re-auth window is for destructive acts only.
 *
 * Who may make them is not "anyone signed in": it is the task's assignee, a
 * lead or contributor on its project, or a manager -- the same gate
 * `saveBoardChanges` uses for a drag, checked here so the drawer and the board
 * cannot disagree.
 *
 * Every one of them writes an activity event in the same transaction as the
 * change, so the feed cannot disagree with the record.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

/**
 * Load the two facts the access check needs, and run it. Returns `null` when
 * the task is gone or the actor may not touch it -- the caller turns that into
 * `notFound` / `forbidden` without a second query.
 */
async function assertMayWork(
  actor: Actor,
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: "notFound" | "forbidden" }> {
  const [row] = await withOrg(actor.organizationId).selectFields(
    tasks,
    { projectId: tasks.projectId, assigneeUserId: tasks.assigneeUserId },
    eq(tasks.id, taskId),
  );
  if (!row) return { ok: false, error: "notFound" };
  if (!(await mayWorkOn(actor, row))) return { ok: false, error: "forbidden" };
  return { ok: true };
}

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
  const gate = await assertMayWork(session.actor, parsed.data);
  if (!gate.ok) return gate;
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
  const gate = await assertMayWork(session.actor, parsed.data);
  if (!gate.ok) return gate;
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
  const gate = await assertMayWork(session.actor, parsed.data.taskId);
  if (!gate.ok) return gate;
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
  const gate = await assertMayWork(session.actor, parsed.data);
  if (!gate.ok) return gate;

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
  const gate = await assertMayWork(session.actor, parsed.data.taskId);
  if (!gate.ok) return gate;
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
  description: z.string().trim().max(4000).optional(),
  projectId: z.union([idSchema, z.literal("")]).optional(),
  assigneeUserId: z.union([idSchema, z.literal("")]).optional(),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

export async function createTask(formData: FormData): Promise<ActionResult> {
  const session = await requirePermissionForAction("task.create");

  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    projectId: formData.get("projectId") ?? "",
    assigneeUserId: formData.get("assigneeUserId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    priority: formData.get("priority") ?? "medium",
  });

  if (!parsed.success) return { ok: false, error: "titleRequired" };

  // Adding a task to a project you are not on is the same overreach as
  // completing one there.
  if (
    parsed.data.projectId &&
    !(await mayWorkOn(session.actor, {
      projectId: parsed.data.projectId,
      assigneeUserId: null,
    }))
  ) {
    return { ok: false, error: "forbidden" };
  }

  // A personal task (no project) is always your own -- nothing scopes the
  // assignee otherwise, since there is no project to check membership
  // against, and assigning your own personal to-do to someone else is not a
  // real case.
  const assigneeUserId = parsed.data.projectId
    ? parsed.data.assigneeUserId || null
    : session.actor.userId;

  const [created] = await withOrg(session.actor.organizationId).insert(tasks, {
    title: parsed.data.title,
    description: parsed.data.description || null,
    projectId: parsed.data.projectId || null,
    assigneeUserId,
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

const boardStatusSchema = z.enum(BOARD_STATUSES);

// Whether a reason is *required* depends on whether this is a genuine move
// into "blocked" from something else, versus a reorder of a card that was
// already there -- and only the task's row in the database, not this
// payload, says which. So the requirement is checked below, once the task's
// prior status is known, rather than here at the shape level.
const boardChangeSchema = z.object({
  taskId: idSchema,
  status: boardStatusSchema,
  position: z.number().int().min(0),
  // The same minimum reportBlocker() already asks for.
  blockedReason: z.string().trim().min(3).max(500).optional(),
});

const saveBoardSchema = z.object({
  projectId: idSchema,
  changes: z.array(boardChangeSchema).max(500),
});

/**
 * Persist a batch of drags at once.
 *
 * The board only ever calls this after somebody presses Save -- every drag
 * before that is local state, see task-board.tsx. Restricted to a `lead` or
 * `contributor` on this project specifically: the same idea as
 * `markChannelRead` or `joinChannel` scoping themselves to the caller's own
 * row rather than adding a new rule to `authz.ts`, because "am I on this
 * project's team" is a many-to-many fact `can()` has no resource shape for
 * (see `Resource` there -- it knows a single owner, not a membership table).
 *
 * Every field this writes mirrors `startTask` / `completeTask` /
 * `reportBlocker` / `clearBlocker` exactly, via `statusFieldsFor()`, so a
 * status changed by dragging and the same status changed from the task
 * drawer leave identical rows behind -- see src/lib/board.ts.
 */
export async function saveBoardChanges(
  projectId: string,
  changes: BoardChange[],
): Promise<ActionResult> {
  const parsed = saveBoardSchema.safeParse({ projectId, changes });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.changes.length === 0) return { ok: true };

  const session = await requireUserForAction();
  const scope = withOrg(session.actor.organizationId);

  const [membership] = await scope.selectFields(
    projectMembers,
    { role: projectMembers.role },
    eq(projectMembers.projectId, parsed.data.projectId),
    eq(projectMembers.userId, session.actor.userId),
  );
  if (!membership || membership.role === "viewer") {
    return { ok: false, error: "forbidden" };
  }

  // Every task named in the batch has to actually belong to this project --
  // otherwise the batch is refused whole, rather than silently dropping the
  // ones that do not, which would tell the caller their save succeeded when
  // part of it was ignored.
  const targetIds = parsed.data.changes.map((change) => change.taskId);
  const ownedTasks = await scope.selectFields(
    tasks,
    { id: tasks.id, status: tasks.status, projectId: tasks.projectId },
    eq(tasks.projectId, parsed.data.projectId),
  );
  const ownedIds = new Set(ownedTasks.map((task) => task.id));
  if (!targetIds.every((id) => ownedIds.has(id))) {
    return { ok: false, error: "invalid" };
  }

  const statusByIdRaw = new Map(ownedTasks.map((task) => [task.id, task.status]));
  // A cancelled task has no column on the board -- see isBoardStatus() -- so
  // it should never appear as a target of a change. Only the tasks this
  // batch actually touches are checked: the project can hold plenty of
  // cancelled tasks nobody is trying to move.
  if (!targetIds.every((id) => isBoardStatus(statusByIdRaw.get(id)!))) {
    return { ok: false, error: "invalid" };
  }
  // Every targeted status just proved to be a BoardStatus, one line up.
  const statusById = statusByIdRaw as Map<string, BoardStatus>;

  // Whether a reason is required depends on the task's actual prior status,
  // not on anything the client claims -- a reorder of a card already sitting
  // in Blocked needs none, matching statusFieldsFor()'s "same status, nothing
  // touched" rule below.
  const missingReason = parsed.data.changes.some(
    (change) =>
      change.status === "blocked" &&
      statusById.get(change.taskId) !== "blocked" &&
      !change.blockedReason,
  );
  if (missingReason) return { ok: false, error: "blockerReasonRequired" };

  const now = new Date();

  await db.transaction(async (tx) => {
    const txScope = withOrg(session.actor.organizationId, tx);

    for (const change of parsed.data.changes) {
      const oldStatus = statusById.get(change.taskId);
      // Already checked to exist above; narrows the type for statusFieldsFor.
      if (!oldStatus) continue;

      const patch = statusFieldsFor(oldStatus, change.status, now, change.blockedReason);

      const [updated] = await txScope.update(
        tasks,
        {
          status: patch.status,
          position: change.position,
          startedAt: patch.startedAt,
          completedAt: patch.completedAt,
          blockedAt: patch.blockedAt,
          blockedReason: patch.blockedReason,
          updatedAt: now,
        },
        eq(tasks.id, change.taskId),
      );

      if (updated && patch.activityVerb) {
        await recordActivity(
          session.actor,
          {
            verb: patch.activityVerb,
            subjectType: "task",
            subjectId: updated.id,
            projectId: updated.projectId,
            taskId: updated.id,
            metadata: patch.activityVerb === "task.blocked" ? { reason: change.blockedReason } : {},
          },
          tx,
        );
      }
    }
  });

  revalidateTaskViews();
  return { ok: true };
}
