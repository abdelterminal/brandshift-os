import "server-only";

import { eq, or, type SQL } from "drizzle-orm";

import { activityEvents } from "@/db/schema/activity";
import { users } from "@/db/schema/people";
import { withOrg, type Executor } from "@/db/tenancy";

import type { Actor } from "../authz";
import { fanOut } from "./notifications";

/**
 * The feed.
 *
 * Every meaningful mutation writes a row, which is what the Activity tabs read
 * and what Phase 2's channels will attach to. Rows are append-only: an event
 * records what happened, and history is never rewritten to match a later
 * correction.
 */

export type ActivityRow = {
  id: string;
  verb: string;
  subjectType:
    | "organization"
    | "user"
    | "department"
    | "project"
    | "task"
    | "meeting"
    | "leave"
    | "company"
    | "deal"
    | "quote"
    | "invoice"
    | "expense";
  subjectId: string;
  projectId: string | null;
  taskId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  actorUserId: string | null;
  actorName: string | null;
};

const ACTIVITY_FIELDS = {
  id: activityEvents.id,
  verb: activityEvents.verb,
  subjectType: activityEvents.subjectType,
  subjectId: activityEvents.subjectId,
  projectId: activityEvents.projectId,
  taskId: activityEvents.taskId,
  metadata: activityEvents.metadata,
  createdAt: activityEvents.createdAt,
  actorUserId: activityEvents.actorUserId,
  actorName: users.name,
};

/** Left: the system acts with no actor. */
const ACTOR_JOIN = [
  { table: users, on: eq(users.id, activityEvents.actorUserId), type: "left" as const },
];

async function readActivity(
  actor: Actor,
  limit: number,
  ...where: Array<SQL | undefined>
): Promise<ActivityRow[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    activityEvents,
    ACTIVITY_FIELDS,
    ACTOR_JOIN,
    ...where,
  )) as ActivityRow[];

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

/** A project's Activity tab. */
export function listProjectActivity(actor: Actor, projectId: string, limit = 50) {
  return readActivity(actor, limit, eq(activityEvents.projectId, projectId));
}

/** A person's Activity tab: what they did, and what happened to them. */
export function listPersonActivity(actor: Actor, userId: string, limit = 50) {
  return readActivity(
    actor,
    limit,
    or(eq(activityEvents.actorUserId, userId), eq(activityEvents.subjectId, userId)),
  );
}

/** The organization's recent activity. */
export function listRecentActivity(actor: Actor, limit = 20) {
  return readActivity(actor, limit);
}

/**
 * Write one event.
 *
 * Takes the executor so it can join the transaction that made the change --
 * an event recording something that was rolled back would be a lie.
 */
export async function recordActivity(
  actor: Actor,
  event: {
    verb: string;
    subjectType: ActivityRow["subjectType"];
    subjectId: string;
    projectId?: string | null;
    taskId?: string | null;
    metadata?: Record<string, unknown>;
  },
  executor?: Executor,
): Promise<void> {
  const [created] = await withOrg(actor.organizationId, executor).insert(activityEvents, {
    actorUserId: actor.userId,
    verb: event.verb,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    projectId: event.projectId ?? null,
    taskId: event.taskId ?? null,
    metadata: event.metadata ?? {},
  });

  if (!created) return;

  // Recording and notifying happen together, through one entry point, so an
  // action cannot write history and quietly tell nobody.
  await fanOut(
    actor,
    created.id,
    {
      verb: event.verb,
      subjectId: event.subjectId,
      projectId: created.projectId,
      taskId: created.taskId,
      metadataAssignee:
        typeof event.metadata?.assigneeUserId === "string" ? event.metadata.assigneeUserId : null,
      // Passed whole for the verbs whose recipient is named in the payload
      // rather than derivable from a project or a task.
      metadata: event.metadata ?? {},
    },
    executor,
  );
}
