import "server-only";

import { eq, inArray } from "drizzle-orm";

import { projectMembers } from "@/db/schema/projects";
import { withOrg } from "@/db/tenancy";
import { atLeast, type Actor } from "@/lib/authz";

/**
 * Who sees the whole organization, and who sees only their own corner of it.
 *
 * A manager and up coordinates work -- that is the job, and it needs the roster,
 * every project's task list, and the activity feed. A plain member does not
 * coordinate anyone: they see their own tasks, the projects they are on, and
 * their teammates by name. What another member is working on, and how far along
 * they are, is not theirs to see -- with one deliberate exception, the handoff
 * link (see `task-links.ts`), which shows one upstream or downstream task as a
 * title, a status and a name and nothing more.
 *
 * The rule lives here rather than in `authz.ts` because it is a data-shape
 * question -- "which rows" rather than "may I" -- the same reason project
 * membership checks live in the data layer.
 */

/** True for a member; false for a manager, admin or owner. */
export function seesOnlyOwnWork(actor: Actor): boolean {
  return !atLeast(actor, "manager");
}

/** Every project this actor belongs to, in any role. */
export async function memberProjectIds(actor: Actor): Promise<string[]> {
  const rows = await withOrg(actor.organizationId).selectFields(
    projectMembers,
    { projectId: projectMembers.projectId },
    eq(projectMembers.userId, actor.userId),
  );
  return [...new Set(rows.map((row) => row.projectId))];
}

/** True if the actor is on this project. */
export async function isOnProject(actor: Actor, projectId: string): Promise<boolean> {
  const [row] = await withOrg(actor.organizationId).selectFields(
    projectMembers,
    { userId: projectMembers.userId },
    eq(projectMembers.projectId, projectId),
    eq(projectMembers.userId, actor.userId),
  );
  return row != null;
}

/**
 * The user ids of everyone who shares a project with this actor, the actor
 * included. This is the population a member's roster is drawn from.
 */
export async function teammateIds(actor: Actor): Promise<string[]> {
  const projectIds = await memberProjectIds(actor);
  const ids = new Set<string>([actor.userId]);
  if (projectIds.length === 0) return [...ids];

  const rows = await withOrg(actor.organizationId).selectFields(
    projectMembers,
    { userId: projectMembers.userId },
    inArray(projectMembers.projectId, projectIds),
  );
  for (const row of rows) ids.add(row.userId);
  return [...ids];
}
