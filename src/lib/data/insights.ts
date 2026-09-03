import "server-only";

import { eq, isNotNull, isNull, ne } from "drizzle-orm";

import { leaveRequests } from "@/db/schema/leave";
import { meetingAttendees, meetings } from "@/db/schema/meetings";
import { memberships, users } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { withOrg } from "@/db/tenancy";

import type { Actor } from "../authz";
import { addDays, dayKey, recentWeeks, startOfDay, startOfWeek } from "../calendar-dates";
import { eachDay, isWeekend } from "../leave-days";

/**
 * Insights.
 *
 * Governed by one rule from `CLAUDE.md`: **no invented dashboard metrics -- if
 * the data is not real, the widget does not ship.** Everything here is counted
 * from rows somebody made by using the app: a completion is a `completed_at`
 * somebody set by pressing Complete, a blocker is a `blocked_at` somebody set
 * by reporting one.
 *
 * And a second: **screens lead with next actions and exceptions, never with
 * vanity totals.** So this does not open with "47 tasks completed". It opens
 * with what has gone wrong, ranked, each row a link to the thing you would
 * have to open to fix it. The trend sits underneath, where a trend belongs.
 *
 * There is deliberately no "productivity" anywhere on it. Tasks completed is a
 * count of tasks, not of value, and putting it beside somebody's name turns a
 * planning tool into a scoreboard.
 */

// ---------------------------------------------------------------------------
// What has gone wrong
// ---------------------------------------------------------------------------

export type ProjectRisk = {
  id: string;
  key: string;
  name: string;
  status: string;
  dueDate: string | null;
  /** Open tasks past their due date. */
  overdue: number;
  blocked: number;
  /** The project's own deadline has passed and it is not finished. */
  pastDue: boolean;
  openTasks: number;
};

/**
 * Projects with something wrong, worst first.
 *
 * Only the ones with something wrong. A list that includes the healthy
 * projects is a list nobody scans to the bottom of, and the healthy ones are
 * already on Work.
 */
export async function projectsAtRisk(actor: Actor, today: string): Promise<ProjectRisk[]> {
  const scope = withOrg(actor.organizationId);

  const [projectRows, taskRows] = await Promise.all([
    scope.selectFields(
      projects,
      {
        id: projects.id,
        key: projects.key,
        name: projects.name,
        status: projects.status,
        dueDate: projects.dueDate,
      },
      isNull(projects.archivedAt),
      ne(projects.status, "completed"),
    ),
    scope.selectFields(
      tasks,
      {
        projectId: tasks.projectId,
        status: tasks.status,
        dueDate: tasks.dueDate,
      },
      ne(tasks.status, "done"),
      ne(tasks.status, "cancelled"),
    ),
  ]);

  const byProject = new Map<string, { overdue: number; blocked: number; open: number }>();
  for (const task of taskRows) {
    if (!task.projectId) continue;
    const tally = byProject.get(task.projectId) ?? { overdue: 0, blocked: 0, open: 0 };
    tally.open += 1;
    if (task.status === "blocked") tally.blocked += 1;
    if (task.dueDate && task.dueDate < today) tally.overdue += 1;
    byProject.set(task.projectId, tally);
  }

  return projectRows
    .map((project) => {
      const tally = byProject.get(project.id) ?? { overdue: 0, blocked: 0, open: 0 };
      return {
        ...project,
        overdue: tally.overdue,
        blocked: tally.blocked,
        openTasks: tally.open,
        pastDue: project.dueDate !== null && project.dueDate < today,
      };
    })
    .filter((project) => project.overdue > 0 || project.blocked > 0 || project.pastDue)
    .sort(
      (a, b) =>
        // Blocked work outranks late work: something late is still moving.
        b.blocked - a.blocked ||
        b.overdue - a.overdue ||
        Number(b.pastDue) - Number(a.pastDue) ||
        a.name.localeCompare(b.name),
    );
}

export type BlockedTask = {
  id: string;
  title: string;
  projectKey: string | null;
  assigneeName: string | null;
  reason: string | null;
  /** Whole days since it was reported. */
  daysBlocked: number;
};

/**
 * What has been stuck longest.
 *
 * Ordered by how long rather than by how important, because the thing that has
 * been blocked for three weeks is the one nobody is looking at any more.
 */
export async function longestBlocked(actor: Actor, now: Date, limit = 8): Promise<BlockedTask[]> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    tasks,
    {
      id: tasks.id,
      title: tasks.title,
      blockedAt: tasks.blockedAt,
      reason: tasks.blockedReason,
      projectKey: projects.key,
      assigneeName: users.name,
    },
    [
      { table: projects, on: eq(projects.id, tasks.projectId), type: "left" as const },
      { table: users, on: eq(users.id, tasks.assigneeUserId), type: "left" as const },
    ],
    eq(tasks.status, "blocked"),
    isNotNull(tasks.blockedAt),
  );

  return (
    rows
      // The query already filters these out; the check is here because the SQL
      // predicate cannot narrow the type, and a silent `!` would be a lie the
      // day somebody edits that predicate.
      .filter((row): row is typeof row & { blockedAt: Date } => row.blockedAt !== null)
      .map((row) => ({
        id: row.id,
        title: row.title,
        projectKey: row.projectKey,
        assigneeName: row.assigneeName,
        reason: row.reason,
        daysBlocked: Math.max(
          0,
          Math.floor((now.getTime() - row.blockedAt.getTime()) / 86_400_000),
        ),
      }))
      .sort((a, b) => b.daysBlocked - a.daysBlocked)
      .slice(0, limit)
  );
}

// ---------------------------------------------------------------------------
// Whether the work is keeping up
// ---------------------------------------------------------------------------

export type WeekPoint = { week: string; created: number; completed: number };

/**
 * Tasks created and completed, by week.
 *
 * The pair, not either alone. "Forty completed" says nothing; forty completed
 * against sixty created says the queue is growing, which is the thing somebody
 * running a studio needs to see before it becomes obvious in the diary.
 *
 * Counted in memory from two date columns. At one agency's volume that is a
 * few hundred rows; the day it is not, this becomes a `date_trunc` and a
 * `group by` behind the same shape.
 */
export async function weeklyThroughput(
  actor: Actor,
  weeks: number,
  today: string,
  timeZone: string,
): Promise<WeekPoint[]> {
  const window = recentWeeks(weeks, today);
  const from = startOfDay(window[0]!, timeZone);

  const rows = await withOrg(actor.organizationId).selectFields(tasks, {
    createdAt: tasks.createdAt,
    completedAt: tasks.completedAt,
  });

  const points = new Map<string, WeekPoint>(
    window.map((week) => [week, { week, created: 0, completed: 0 }]),
  );

  for (const row of rows) {
    if (row.createdAt >= from) {
      const point = points.get(startOfWeek(dayKey(row.createdAt, timeZone)));
      if (point) point.created += 1;
    }
    if (row.completedAt && row.completedAt >= from) {
      const point = points.get(startOfWeek(dayKey(row.completedAt, timeZone)));
      if (point) point.completed += 1;
    }
  }

  return window.map((week) => points.get(week)!);
}

// ---------------------------------------------------------------------------
// Where the work sits
// ---------------------------------------------------------------------------

export type PersonLoad = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  open: number;
  overdue: number;
  blocked: number;
  /** Hours booked in meetings this week. */
  meetingHours: number;
  /** Working days of approved leave still ahead, within the next month. */
  awayDays: number;
};

/**
 * What each person is carrying.
 *
 * Open work, late work, and the two things that quietly eat the week: hours
 * already committed to meetings, and days they will not be here. Somebody with
 * nine open tasks and eleven hours of meetings is not the same as somebody
 * with nine open tasks, and a plan made from the first number alone is wrong.
 *
 * There is no "completed" column, deliberately. Tasks completed is a count of
 * tasks, not of value, and next to a person's name it stops being a workload
 * view and becomes a scoreboard.
 */
export async function loadByPerson(
  actor: Actor,
  today: string,
  timeZone: string,
): Promise<PersonLoad[]> {
  const scope = withOrg(actor.organizationId);

  const weekStart = startOfWeek(today);
  const weekFrom = startOfDay(weekStart, timeZone);
  const weekTo = startOfDay(addDays(weekStart, 7), timeZone);
  const horizon = addDays(today, 30);

  const [people, openTasks, meetingRows, away] = await Promise.all([
    scope.selectJoined(
      memberships,
      {
        userId: memberships.userId,
        jobTitle: memberships.jobTitle,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
      [{ table: users, on: eq(users.id, memberships.userId), type: "inner" as const }],
      eq(memberships.status, "active"),
    ),
    scope.selectFields(
      tasks,
      { assigneeUserId: tasks.assigneeUserId, status: tasks.status, dueDate: tasks.dueDate },
      ne(tasks.status, "done"),
      ne(tasks.status, "cancelled"),
    ),
    scope.selectJoined(
      meetingAttendees,
      {
        userId: meetingAttendees.userId,
        response: meetingAttendees.response,
        startsAt: meetings.startsAt,
        endsAt: meetings.endsAt,
      },
      [
        {
          table: meetings,
          on: eq(meetings.id, meetingAttendees.meetingId),
          type: "inner" as const,
        },
      ],
      isNull(meetings.cancelledAt),
    ),
    scope.selectFields(
      leaveRequests,
      {
        userId: leaveRequests.userId,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
      },
      eq(leaveRequests.status, "approved"),
    ),
  ]);

  const load = new Map<string, PersonLoad>(
    people.map((person) => [
      person.userId,
      {
        userId: person.userId,
        name: person.name,
        avatarUrl: person.avatarUrl,
        jobTitle: person.jobTitle,
        open: 0,
        overdue: 0,
        blocked: 0,
        meetingHours: 0,
        awayDays: 0,
      },
    ]),
  );

  for (const task of openTasks) {
    if (!task.assigneeUserId) continue;
    const person = load.get(task.assigneeUserId);
    if (!person) continue;

    person.open += 1;
    if (task.status === "blocked") person.blocked += 1;
    if (task.dueDate && task.dueDate < today) person.overdue += 1;
  }

  for (const row of meetingRows) {
    // A declined invitation is not an hour of somebody's week.
    if (row.response === "declined") continue;
    if (row.startsAt >= weekTo || row.endsAt <= weekFrom) continue;

    const person = load.get(row.userId);
    if (!person) continue;
    person.meetingHours += (row.endsAt.getTime() - row.startsAt.getTime()) / 3_600_000;
  }

  for (const request of away) {
    const person = load.get(request.userId);
    if (!person) continue;

    for (const day of eachDay(request.startDate, request.endDate)) {
      if (day < today || day > horizon || isWeekend(day)) continue;
      person.awayDays += 1;
    }
  }

  return [...load.values()]
    .map((person) => ({ ...person, meetingHours: Math.round(person.meetingHours * 10) / 10 }))
    .sort(
      (a, b) =>
        b.blocked - a.blocked ||
        b.overdue - a.overdue ||
        b.open - a.open ||
        a.name.localeCompare(b.name),
    );
}
