import "server-only";

import { eq, ilike, isNull, or, type SQL } from "drizzle-orm";

import { departments, users } from "@/db/schema/people";
import { projectMembers, projects } from "@/db/schema/projects";
import { withOrg } from "@/db/tenancy";
import { isUuid } from "@/lib/uuid";

import type { Actor } from "../authz";
import type { ProjectStage } from "./pipeline";

/** Project reads. */

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";

export type ProjectRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  /** Where it is in the client delivery flow. `null` for internal projects. */
  stage: ProjectStage | null;
  stageChangedAt: Date | null;
  priority: "low" | "medium" | "high" | "urgent";
  startDate: string | null;
  dueDate: string | null;
  departmentId: string | null;
  departmentName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
};

const PROJECT_FIELDS = {
  id: projects.id,
  key: projects.key,
  name: projects.name,
  description: projects.description,
  status: projects.status,
  stage: projects.stage,
  stageChangedAt: projects.stageChangedAt,
  priority: projects.priority,
  startDate: projects.startDate,
  dueDate: projects.dueDate,
  departmentId: projects.departmentId,
  departmentName: departments.name,
  ownerUserId: projects.ownerUserId,
  ownerName: users.name,
};

const PROJECT_JOINS = [
  { table: departments, on: eq(departments.id, projects.departmentId), type: "left" as const },
  { table: users, on: eq(users.id, projects.ownerUserId), type: "left" as const },
];

export type ProjectFilter = {
  query?: string;
  status?: ProjectStatus;
  departmentId?: string;
  /** Archived projects are hidden unless asked for. */
  includeArchived?: boolean;
};

function projectConditions(filter: ProjectFilter): Array<SQL | undefined> {
  const trimmed = filter.query?.trim();

  return [
    filter.includeArchived ? undefined : isNull(projects.archivedAt),
    trimmed
      ? or(ilike(projects.name, `%${trimmed}%`), ilike(projects.key, `%${trimmed}%`))
      : undefined,
    filter.status ? eq(projects.status, filter.status) : undefined,
    filter.departmentId ? eq(projects.departmentId, filter.departmentId) : undefined,
  ];
}

/** The order projects are listed in: active work first, finished work last. */
const STATUS_ORDER: Record<ProjectStatus, number> = {
  active: 0,
  planning: 1,
  on_hold: 2,
  completed: 3,
  archived: 4,
};

export async function listProjects(
  actor: Actor,
  filter: ProjectFilter = {},
): Promise<ProjectRow[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    projects,
    PROJECT_FIELDS,
    PROJECT_JOINS,
    ...projectConditions(filter),
  )) as ProjectRow[];

  return rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") ||
      a.name.localeCompare(b.name),
  );
}

/** Looked up by key, not id: `/work/MER` is a URL someone can read and share. */
export async function getProjectByKey(actor: Actor, key: string): Promise<ProjectRow | null> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    projects,
    PROJECT_FIELDS,
    PROJECT_JOINS,
    eq(projects.key, key.toUpperCase()),
  )) as ProjectRow[];

  return rows[0] ?? null;
}

/** The raw row by id -- for an action that needs `ownerUserId` for a `can()` check. */
export async function getProjectById(actor: Actor, projectId: string) {
  if (!isUuid(projectId)) return null;
  const [row] = await withOrg(actor.organizationId).select(projects, eq(projects.id, projectId));
  return row ?? null;
}

export type ProjectMemberRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: "lead" | "contributor" | "viewer";
  addedAt: Date;
};

export async function listProjectMembers(
  actor: Actor,
  projectId: string,
): Promise<ProjectMemberRow[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    projectMembers,
    {
      userId: projectMembers.userId,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: projectMembers.role,
      addedAt: projectMembers.addedAt,
    },
    [{ table: users, on: eq(users.id, projectMembers.userId), type: "inner" as const }],
    eq(projectMembers.projectId, projectId),
  )) as ProjectMemberRow[];

  const ROLE_ORDER = { lead: 0, contributor: 1, viewer: 2 } as const;
  return rows.sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
  );
}

/** Which projects a person is on, for their detail page. */
export async function listProjectsForUser(actor: Actor, userId: string): Promise<ProjectRow[]> {
  const memberRows = await withOrg(actor.organizationId).selectFields(
    projectMembers,
    { projectId: projectMembers.projectId },
    eq(projectMembers.userId, userId),
  );

  if (memberRows.length === 0) return [];
  const ids = new Set(memberRows.map((row) => row.projectId));

  const all = await listProjects(actor);
  return all.filter((project) => ids.has(project.id));
}

/**
 * Create a project from an accepted quote.
 *
 * The handover CRM left open: selling the work and doing it were two halves
 * with retyping between them. Each quote line becomes a task, because the
 * lines are what was agreed and therefore what has to be delivered.
 *
 * Kept here rather than in `finance.ts` so that `projects` is still only
 * written to from one module -- the key uniqueness check and the owner rule
 * live here and there is no second copy of either.
 */
export async function createProjectFromQuote(
  actor: Actor,
  input: { key: string; name: string; description: string; deliverables: string[] },
): Promise<{ id: string; key: string } | null> {
  const { db } = await import("@/db/client");
  const { tasks } = await import("@/db/schema/tasks");

  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const clash = await scope.selectFields(
      projects,
      { id: projects.id },
      eq(projects.key, input.key),
    );
    if (clash.length > 0) return null;

    const [project] = await scope.insert(projects, {
      key: input.key,
      name: input.name,
      description: input.description,
      status: "planning",
      priority: "medium",
      ownerUserId: actor.userId,
      createdByUserId: actor.userId,
    });
    if (!project) return null;

    await scope.insert(projectMembers, {
      projectId: project.id,
      userId: actor.userId,
      role: "lead" as const,
    });

    if (input.deliverables.length > 0) {
      await scope.insert(
        tasks,
        input.deliverables.map((title, position) => ({
          projectId: project.id,
          title: title.slice(0, 200),
          status: "todo" as const,
          priority: "medium" as const,
          position,
          createdByUserId: actor.userId,
        })),
      );
    }

    return { id: project.id, key: project.key };
  });
}
