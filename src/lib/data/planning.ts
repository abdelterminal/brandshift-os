import "server-only";

import { and, eq, isNotNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import { organizations } from "@/db/schema/organizations";
import { users } from "@/db/schema/people";
import { projectMembers, projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { withOrg } from "@/db/tenancy";

import type { Actor } from "../authz";

/**
 * "No plan yet" -- a project member who has been on the project longer than
 * the organization's grace period and has not put a single task of their own
 * on it.
 *
 * Computed at read time, the same way `isOverdue()` is: there is no scheduler
 * in this deployment, so nothing can *tell* anyone the moment the window
 * closes. What this can do is make the fact visible wherever someone already
 * looks -- the coordination queue, the member's own project page, their own
 * Today -- which is the honest version of a warning without a job runner to
 * fire it.
 *
 * A `viewer`-role member is excluded: nothing assigns that role today, but if
 * it ever does, watching is not a plan to be missing one.
 */

export type UnplannedRow = {
  userId: string;
  name: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  addedAt: Date;
  hoursSince: number;
};

/**
 * The organization's own threshold. `organizations` is the tenant root, not a
 * tenant-owned table, so this reads it directly rather than through
 * `withOrg()` -- the same exception `getCurrentUser()` already relies on.
 */
export async function planningGraceHours(actor: Actor): Promise<number> {
  const [row] = await db
    .select({ hours: organizations.planningGraceHours })
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId));
  return row?.hours ?? 48;
}

/** The pure half, so the arithmetic can be tested without a database. */
export function hoursSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (60 * 60 * 1000);
}

/**
 * Everyone in the org who has no plan yet, or -- with `onlyUserId` -- just
 * one person's own rows. One query plus an in-memory anti-join against which
 * `(project, person)` pairs already hold a task, which is the same trade the
 * rest of this app's reporting makes at this scale (see `workloadFrom`).
 *
 * Returned whole, with no grace-period filtering here: a member's own project
 * page wants to know the moment there is nothing planned, and only a
 * coordinator's screen cares whether the window has actually closed. Each
 * caller decides, against its own `planningGraceHours(actor)` and the row's
 * `hoursSince`.
 */
export async function listUnplannedMembers(
  actor: Actor,
  options: { onlyUserId?: string } = {},
): Promise<UnplannedRow[]> {
  const now = new Date();

  const memberRows = await withOrg(actor.organizationId).selectJoined(
    projectMembers,
    {
      userId: projectMembers.userId,
      name: users.name,
      role: projectMembers.role,
      projectId: projects.id,
      projectKey: projects.key,
      projectName: projects.name,
      addedAt: projectMembers.addedAt,
    },
    [
      { table: users, on: eq(users.id, projectMembers.userId), type: "inner" as const },
      { table: projects, on: eq(projects.id, projectMembers.projectId), type: "inner" as const },
    ],
    and(
      // Only a project still being worked expects a plan. A project on hold
      // or finished is not asking anyone to break work down right now.
      or(eq(projects.status, "planning"), eq(projects.status, "active")),
      options.onlyUserId ? eq(projectMembers.userId, options.onlyUserId) : undefined,
    ),
  );

  const assignedPairs = new Set(
    (
      await withOrg(actor.organizationId).selectFields(
        tasks,
        { projectId: tasks.projectId, assigneeUserId: tasks.assigneeUserId },
        isNotNull(tasks.projectId),
        isNotNull(tasks.assigneeUserId),
      )
    ).map((row) => `${row.projectId}:${row.assigneeUserId}`),
  );

  return memberRows
    .filter((row) => row.role !== "viewer")
    .filter((row) => !assignedPairs.has(`${row.projectId}:${row.userId}`))
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      projectId: row.projectId,
      projectKey: row.projectKey,
      projectName: row.projectName,
      addedAt: row.addedAt,
      hoursSince: hoursSince(row.addedAt, now),
    }))
    .sort((a, b) => b.hoursSince - a.hoursSince);
}
