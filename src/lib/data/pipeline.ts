import "server-only";

import { eq, inArray, isNotNull, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { withOrg } from "@/db/tenancy";
import type { Actor } from "@/lib/authz";
import { organizationToday } from "@/lib/data/tasks";
import { isUuid } from "@/lib/uuid";

import {
  PROJECT_STAGES,
  type PipelineCard,
  type PipelineColumn,
  type ProjectStage,
} from "./pipeline-stages";

/**
 * The client delivery flow.
 *
 * A project's `stage` is the phase of the flow it is in; `status` is the health
 * of the work. The two are orthogonal -- a project can be `active` and sitting
 * in `production`, or `on_hold` in `client_validation`. Internal projects have
 * no stage and never reach this board.
 *
 * The ordered stage list and the row shapes live in `pipeline-stages.ts` so a
 * Client Component can import them without pulling this `server-only` module.
 */
export {
  PROJECT_STAGES,
  isProjectStage,
  type PipelineCard,
  type PipelineColumn,
  type ProjectStage,
} from "./pipeline-stages";

/**
 * Every stage, in order, each with the projects sitting in it.
 *
 * Empty columns are returned rather than skipped: the board is a fixed set of
 * lanes, and a missing lane reads as "this stage does not exist" rather than
 * "nothing is here". Archived projects are left out, and a project with no
 * stage is not on the flow so it is left out too.
 */
export async function listPipeline(actor: Actor): Promise<PipelineColumn[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    projects,
    {
      id: projects.id,
      key: projects.key,
      name: projects.name,
      ownerUserId: projects.ownerUserId,
      ownerName: users.name,
      priority: projects.priority,
      stage: projects.stage,
      stageChangedAt: projects.stageChangedAt,
    },
    [{ table: users, on: eq(users.id, projects.ownerUserId), type: "left" as const }],
    isNotNull(projects.stage),
    ne(projects.status, "archived"),
  )) as Array<{
    id: string;
    key: string;
    name: string;
    ownerUserId: string | null;
    ownerName: string | null;
    priority: PipelineCard["priority"];
    stage: ProjectStage;
    stageChangedAt: Date | null;
  }>;

  const counts = await taskCountsByProject(
    actor,
    rows.map((row) => row.id),
  );

  const byStage = new Map<ProjectStage, PipelineCard[]>();
  for (const stage of PROJECT_STAGES) byStage.set(stage, []);

  for (const row of rows) {
    const c = counts.get(row.id) ?? { open: 0, blocked: 0, overdue: 0 };
    byStage.get(row.stage)!.push({
      id: row.id,
      key: row.key,
      name: row.name,
      ownerUserId: row.ownerUserId,
      ownerName: row.ownerName,
      priority: row.priority,
      stageChangedAt: row.stageChangedAt,
      openCount: c.open,
      blockedCount: c.blocked,
      overdueCount: c.overdue,
    });
  }

  const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
  for (const cards of byStage.values()) {
    cards.sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.name.localeCompare(b.name),
    );
  }

  return PROJECT_STAGES.map((stage) => ({ stage, cards: byStage.get(stage)! }));
}

async function taskCountsByProject(actor: Actor, projectIds: string[]) {
  const counts = new Map<string, { open: number; blocked: number; overdue: number }>();
  if (projectIds.length === 0) return counts;

  const today = organizationToday();
  const rows = await withOrg(actor.organizationId).selectFields(
    tasks,
    { projectId: tasks.projectId, status: tasks.status, dueDate: tasks.dueDate },
    inArray(tasks.projectId, projectIds),
    ne(tasks.status, "done"),
    ne(tasks.status, "cancelled"),
  );

  for (const row of rows) {
    if (!row.projectId) continue;
    const entry = counts.get(row.projectId) ?? { open: 0, blocked: 0, overdue: 0 };
    entry.open += 1;
    if (row.status === "blocked") entry.blocked += 1;
    if (row.status !== "blocked" && row.dueDate !== null && row.dueDate < today) entry.overdue += 1;
    counts.set(row.projectId, entry);
  }

  return counts;
}

/**
 * Move a project to a stage, or off the flow entirely (`null`).
 *
 * Returns the transition so the caller can record it -- `null` when the project
 * does not exist or was already there, so nothing is written and no event
 * fires for a no-op drag onto the same column.
 */
export async function setProjectStage(
  actor: Actor,
  projectId: string,
  stage: ProjectStage | null,
): Promise<{ from: ProjectStage | null; to: ProjectStage | null } | null> {
  if (!isUuid(projectId)) return null;

  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [current] = await scope.selectFields(
      projects,
      { stage: projects.stage },
      eq(projects.id, projectId),
    );
    if (!current) return null;
    if (current.stage === stage) return null;

    await scope.update(
      projects,
      { stage, stageChangedAt: new Date(), updatedAt: new Date() },
      eq(projects.id, projectId),
    );

    return { from: current.stage as ProjectStage | null, to: stage };
  });
}
