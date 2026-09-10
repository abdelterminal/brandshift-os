import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { deliverables } from "@/db/schema/deliverables";
import { users } from "@/db/schema/people";
import { tasks } from "@/db/schema/tasks";
import { withOrg } from "@/db/tenancy";
import type { Actor } from "@/lib/authz";
import { compareByFlow, type DeliverableStatus } from "@/lib/deliverables";
import type { ProjectStage } from "@/lib/data/pipeline-stages";
import { isUuid } from "@/lib/uuid";

/**
 * Reading and writing deliverables.
 *
 * The status enum carries the lifecycle; `setDeliverableStatus` stamps the two
 * dates that matter (`started_at`, `published_at`) and the client feedback, so
 * the caller only ever names the state it wants.
 */

export type DeliverableView = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: DeliverableStatus;
  stage: ProjectStage | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  clientFeedback: string | null;
  dueDate: string | null;
  position: number;
  publishedAt: Date | null;
  createdAt: Date;
};

const FIELDS = {
  id: deliverables.id,
  projectId: deliverables.projectId,
  title: deliverables.title,
  description: deliverables.description,
  status: deliverables.status,
  stage: deliverables.stage,
  assigneeUserId: deliverables.assigneeUserId,
  assigneeName: users.name,
  clientFeedback: deliverables.clientFeedback,
  dueDate: deliverables.dueDate,
  position: deliverables.position,
  publishedAt: deliverables.publishedAt,
  createdAt: deliverables.createdAt,
};

export async function listProjectDeliverables(
  actor: Actor,
  projectId: string,
): Promise<DeliverableView[]> {
  if (!isUuid(projectId)) return [];

  const rows = (await withOrg(actor.organizationId).selectJoined(
    deliverables,
    FIELDS,
    [{ table: users, on: eq(users.id, deliverables.assigneeUserId), type: "left" as const }],
    eq(deliverables.projectId, projectId),
  )) as DeliverableView[];

  return rows.sort(compareByFlow);
}

export async function getDeliverableById(actor: Actor, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await withOrg(actor.organizationId).select(deliverables, eq(deliverables.id, id));
  return row ?? null;
}

async function nextPosition(scope: ReturnType<typeof withOrg>, projectId: string): Promise<number> {
  const rows = await scope.selectFields(
    deliverables,
    { position: deliverables.position },
    eq(deliverables.projectId, projectId),
  );
  return rows.reduce((m, r) => Math.max(m, r.position ?? 0), 0) + 1;
}

export async function createDeliverable(
  actor: Actor,
  input: {
    projectId: string;
    title: string;
    description: string | null;
    stage: ProjectStage | null;
    assigneeUserId: string | null;
    dueDate: string | null;
  },
): Promise<{ id: string } | null> {
  const scope = withOrg(actor.organizationId);
  const position = await nextPosition(scope, input.projectId);

  const [created] = await scope.insert(deliverables, {
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    stage: input.stage,
    assigneeUserId: input.assigneeUserId,
    dueDate: input.dueDate,
    position,
    createdByUserId: actor.userId,
  });

  return created ? { id: created.id } : null;
}

export async function updateDeliverable(
  actor: Actor,
  id: string,
  input: {
    title: string;
    description: string | null;
    stage: ProjectStage | null;
    assigneeUserId: string | null;
    dueDate: string | null;
  },
): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    deliverables,
    {
      title: input.title,
      description: input.description,
      stage: input.stage,
      assigneeUserId: input.assigneeUserId,
      dueDate: input.dueDate,
      updatedAt: new Date(),
    },
    eq(deliverables.id, id),
  );
  return updated.length > 0;
}

/**
 * Move a deliverable to a status.
 *
 * Stamps `started_at` the first time it leaves `producing`, `published_at`
 * when it reaches `published`, and records the client's feedback when it goes
 * to `revising`. Returns the transition, or `null` if the row is gone or was
 * already there.
 */
export async function setDeliverableStatus(
  actor: Actor,
  id: string,
  status: DeliverableStatus,
  feedback: string | null,
): Promise<{ from: DeliverableStatus; to: DeliverableStatus } | null> {
  if (!isUuid(id)) return null;
  const scope = withOrg(actor.organizationId);

  const [current] = await scope.selectFields(
    deliverables,
    { status: deliverables.status, startedAt: deliverables.startedAt },
    eq(deliverables.id, id),
  );
  if (!current) return null;
  if (current.status === status) return null;

  await scope.update(
    deliverables,
    {
      status,
      startedAt:
        current.startedAt ?? (status !== "producing" && status !== "cancelled" ? new Date() : null),
      publishedAt: status === "published" ? new Date() : null,
      clientFeedback: status === "revising" ? feedback : undefined,
      updatedAt: new Date(),
    },
    eq(deliverables.id, id),
  );

  return { from: current.status as DeliverableStatus, to: status };
}

/**
 * Turn a task into a deliverable.
 *
 * The one structural move: a row cannot be both, so the task is removed and a
 * deliverable takes its place, carrying everything that maps across. One
 * transaction -- a task that vanished without a deliverable appearing, or the
 * reverse, are both states a list cannot show.
 */
export async function convertTaskToDeliverable(
  actor: Actor,
  taskId: string,
  stage: ProjectStage | null,
): Promise<{ id: string; projectId: string; title: string } | null> {
  if (!isUuid(taskId)) return null;

  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [task] = await scope.selectFields(
      tasks,
      {
        title: tasks.title,
        description: tasks.description,
        assigneeUserId: tasks.assigneeUserId,
        dueDate: tasks.dueDate,
        projectId: tasks.projectId,
      },
      eq(tasks.id, taskId),
    );
    if (!task || !task.projectId) return null;

    const position = await nextPosition(scope, task.projectId);

    const [created] = await scope.insert(deliverables, {
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      stage,
      assigneeUserId: task.assigneeUserId,
      dueDate: task.dueDate,
      position,
      createdByUserId: actor.userId,
    });
    if (!created) return null;

    await scope.delete(tasks, eq(tasks.id, taskId));

    return { id: created.id, projectId: task.projectId, title: task.title };
  });
}
