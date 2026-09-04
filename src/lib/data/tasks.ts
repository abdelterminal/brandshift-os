import "server-only";

import { eq, isNull, or, sql, type SQL } from "drizzle-orm";

import { users } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { withOrg } from "@/db/tenancy";
import { isUuid } from "@/lib/uuid";

import type { Actor } from "../authz";
import {
  BUCKET_ORDER,
  type TaskBucket,
  type TaskPriority,
  type TaskRow,
} from "./task-types";

/**
 * Task reads.
 *
 * The organising idea is the bucket. A flat list sorted by date makes each
 * person work out what matters; the buckets say it. Overdue comes first
 * because it is already late, then today, then everything else -- which is the
 * order someone would sort their own day into anyway.
 */

const TASK_FIELDS = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  blockedReason: tasks.blockedReason,
  estimateHours: tasks.estimateHours,
  assigneeUserId: tasks.assigneeUserId,
  assigneeName: users.name,
  projectId: tasks.projectId,
  projectKey: projects.key,
  projectName: projects.name,
};

/** Both are left joins: a task may have no assignee and no project. */
const NAME_JOINS = [
  { table: users, on: eq(users.id, tasks.assigneeUserId), type: "left" as const },
  { table: projects, on: eq(projects.id, tasks.projectId), type: "left" as const },
];

/**
 * Open means it still needs doing. `cancelled` is neither open nor complete --
 * it is work someone decided not to do, and it belongs in neither queue.
 */
export const OPEN_TASKS = or(
  eq(tasks.status, "todo"),
  eq(tasks.status, "in_progress"),
  eq(tasks.status, "blocked"),
)!;

/**
 * Today in the organization's timezone, not the server's.
 *
 * A container running UTC would otherwise call a Paris task overdue for the
 * last hour of the previous evening.
 */
export const ORG_TODAY = sql<string>`(now() at time zone 'Europe/Paris')::date`;

export type TaskFilter = {
  projectId?: string;
  assigneeUserId?: string;
  /** Unassigned only -- the third column of the coordination queue. */
  unassigned?: boolean;
};

function filterConditions(filter: TaskFilter): Array<SQL | undefined> {
  return [
    filter.projectId ? eq(tasks.projectId, filter.projectId) : undefined,
    filter.assigneeUserId ? eq(tasks.assigneeUserId, filter.assigneeUserId) : undefined,
    filter.unassigned ? isNull(tasks.assigneeUserId) : undefined,
  ];
}

function selectTasks(actor: Actor, ...where: Array<SQL | undefined>): Promise<TaskRow[]> {
  return withOrg(actor.organizationId).selectJoined(
    tasks,
    TASK_FIELDS,
    NAME_JOINS,
    ...where,
  ) as Promise<TaskRow[]>;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Soonest first, then most urgent, then alphabetical so the order is stable. */
function byUrgency(a: TaskRow, b: TaskRow): number {
  return (
    (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") ||
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    a.title.localeCompare(b.title)
  );
}

/**
 * Split open work into buckets, plus a short tail of what was finished.
 *
 * The bucketing is done here rather than in SQL because "today" depends on the
 * organization's timezone and the set is small; five hundred tasks is still
 * one query and a sort.
 */
export function bucketTasks(
  open: TaskRow[],
  completed: TaskRow[],
  todayIso: string,
): Record<TaskBucket, TaskRow[]> {
  const buckets: Record<TaskBucket, TaskRow[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    noDeadline: [],
    completed,
  };

  for (const task of open) {
    if (task.dueDate === null) buckets.noDeadline.push(task);
    else if (task.dueDate < todayIso) buckets.overdue.push(task);
    else if (task.dueDate === todayIso) buckets.today.push(task);
    else buckets.upcoming.push(task);
  }

  for (const key of ["overdue", "today", "upcoming", "noDeadline"] as const) {
    buckets[key].sort(byUrgency);
  }

  return buckets;
}

/** Today's date in the organization's timezone, as `YYYY-MM-DD`. */
export function organizationToday(timeZone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The prioritised list: open work in the order it should be dealt with. */
export async function listTaskBuckets(
  actor: Actor,
  filter: TaskFilter = {},
): Promise<Record<TaskBucket, TaskRow[]>> {
  const conditions = filterConditions(filter);

  const [open, completed] = await Promise.all([
    selectTasks(actor, OPEN_TASKS, ...conditions),
    selectTasks(actor, eq(tasks.status, "done"), ...conditions),
  ]);

  completed.sort((a, b) => b.title.localeCompare(a.title));
  return bucketTasks(open, completed.slice(0, 25), organizationToday());
}

/** Every task on a project, for the Kanban view and the counts. */
export async function listProjectTasks(actor: Actor, projectId: string): Promise<TaskRow[]> {
  const rows = await selectTasks(actor, eq(tasks.projectId, projectId));
  return rows.sort(byUrgency);
}

export async function getTask(actor: Actor, taskId: string): Promise<TaskRow | null> {
  // A malformed id is a missing row, not a server error -- see `isUuid`.
  if (!isUuid(taskId)) return null;

  const [task] = await selectTasks(actor, eq(tasks.id, taskId));
  return task ?? null;
}

/**
 * The admin coordination queue.
 *
 * What needs a decision from someone, rather than what needs doing by someone.
 * Blocked first: it is the only column where the work has stopped and will not
 * restart on its own.
 */
export async function coordinationQueue(actor: Actor): Promise<{
  blocked: TaskRow[];
  overdue: TaskRow[];
  unassigned: TaskRow[];
  open: TaskRow[];
}> {
  // One read, partitioned three ways. The three columns overlap -- a task can
  // be blocked *and* unassigned -- so querying them separately would fetch the
  // same rows more than once anyway.
  const open = await listOpenTasks(actor);
  const todayIso = organizationToday();

  return {
    blocked: open.filter((task) => task.status === "blocked").sort(byUrgency),
    overdue: open
      .filter(
        (task) =>
          task.status !== "blocked" && task.dueDate !== null && task.dueDate < todayIso,
      )
      .sort(byUrgency),
    unassigned: open.filter((task) => task.assigneeUserId === null).sort(byUrgency),
    open,
  };
}

/**
 * Open and overdue counts per person.
 *
 * Counted in memory from the open set rather than with a GROUP BY: the guided
 * assignment step needs this alongside the task list it is already loading, and
 * one query beats two.
 */
export function workloadFrom(open: TaskRow[], todayIso: string): Map<string, {
  open: number;
  overdue: number;
}> {
  const workload = new Map<string, { open: number; overdue: number }>();

  for (const task of open) {
    if (!task.assigneeUserId) continue;
    const entry = workload.get(task.assigneeUserId) ?? { open: 0, overdue: 0 };
    entry.open += 1;
    if (task.dueDate !== null && task.dueDate < todayIso) entry.overdue += 1;
    workload.set(task.assigneeUserId, entry);
  }

  return workload;
}

/** Every open task in the org, for workload and for Today. */
export async function listOpenTasks(actor: Actor): Promise<TaskRow[]> {
  return selectTasks(actor, OPEN_TASKS);
}

export { BUCKET_ORDER };
export type { TaskBucket, TaskPriority, TaskRow, TaskStatus } from "./task-types";
