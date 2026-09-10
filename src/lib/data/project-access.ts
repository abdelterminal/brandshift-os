import "server-only";

import { eq, ne } from "drizzle-orm";

import { projectMembers } from "@/db/schema/projects";
import { withOrg } from "@/db/tenancy";
import { atLeast, type Actor } from "@/lib/authz";

/**
 * Who may change a piece of work's state.
 *
 * Not a rule in `authz.ts`: "am I on this project's team" is a membership-table
 * fact, and `can()`'s `Resource` knows a single owner, not a join table -- so
 * the check lives here, the same call `saveBoardChanges` already makes. The
 * gate is deliberately wider than assignee-only: a lead has to be able to
 * unblock or finish something for someone who is away.
 */

/** The pure half, so the branches can be tested without a database. */
export function decideWorkAccess(input: {
  isManager: boolean;
  isAssignee: boolean;
  /** The actor's role on the project, or `null` if they are not a member. */
  memberRole: "lead" | "contributor" | "viewer" | null;
  /** True for a personal task -- one with no project. */
  personal: boolean;
}): boolean {
  if (input.isManager) return true;
  if (input.isAssignee) return true;
  // A personal task with no project belongs to its assignee, and that has
  // already been checked. Anyone else, including a manager's absence, is out.
  if (input.personal) return false;
  return input.memberRole === "lead" || input.memberRole === "contributor";
}

export async function mayWorkOn(
  actor: Actor,
  work: { projectId: string | null; assigneeUserId: string | null },
): Promise<boolean> {
  const isManager = atLeast(actor, "manager");
  const isAssignee = work.assigneeUserId != null && work.assigneeUserId === actor.userId;

  if (isManager || isAssignee) return true;
  if (work.projectId == null) return false;

  const [membership] = await withOrg(actor.organizationId).selectFields(
    projectMembers,
    { role: projectMembers.role },
    eq(projectMembers.projectId, work.projectId),
    eq(projectMembers.userId, actor.userId),
  );

  return decideWorkAccess({
    isManager,
    isAssignee,
    memberRole: membership?.role ?? null,
    personal: false,
  });
}

/** The projects the actor may work on as a member (not a `viewer`). */
export async function listWorkableProjectIds(actor: Actor): Promise<string[]> {
  const rows = await withOrg(actor.organizationId).selectFields(
    projectMembers,
    { projectId: projectMembers.projectId },
    eq(projectMembers.userId, actor.userId),
    ne(projectMembers.role, "viewer"),
  );
  return rows.map((row) => row.projectId);
}
