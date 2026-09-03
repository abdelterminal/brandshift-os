import "server-only";

import type { Actor } from "../authz";
import { dayKey, startOfDay } from "../calendar-dates";
import { listMeetings, type MeetingWithAttendees } from "./meetings";
import { listOpenTasks } from "./tasks";
import { listProjects } from "./projects";

/**
 * The calendar.
 *
 * It owns nothing. Meetings live in `meetings`, task deadlines on the task and
 * project deadlines on the project, and this reads all three where they
 * already are. The alternative -- an `events` table that a deadline is copied
 * into -- is a calendar that disagrees with the task by the end of the week,
 * and then two places to fix it.
 *
 * Which means everything here is real. Nothing on this screen is a marker
 * somebody has to remember to keep in step with the thing it stands for.
 */

export type AgendaEntry =
  | { kind: "meeting"; id: string; day: string; sortAt: number; meeting: MeetingWithAttendees }
  | {
      kind: "task";
      id: string;
      day: string;
      sortAt: number;
      title: string;
      status: string;
      projectKey: string | null;
      assigneeName: string | null;
      mine: boolean;
    }
  | {
      kind: "project";
      id: string;
      day: string;
      sortAt: number;
      key: string;
      name: string;
      mine: boolean;
    };

export type AgendaDay = { day: string; entries: AgendaEntry[] };

export type AgendaFilter = {
  /** Inclusive first day, `YYYY-MM-DD`. */
  from: string;
  /** Exclusive last day, so a range never counts a day twice. */
  to: string;
  timeZone: string;
  /** Yours only, which is what a calendar is for most of the time. */
  mineOnly: boolean;
};

/**
 * Everything happening between two days, grouped by day.
 *
 * Deadlines have no time of day, so they sort to the top of their day: what is
 * due today is context for the day, not something that happens at midnight.
 */
export async function readAgenda(actor: Actor, filter: AgendaFilter): Promise<AgendaDay[]> {
  const from = startOfDay(filter.from, filter.timeZone);
  const to = startOfDay(filter.to, filter.timeZone);

  const [meetings, tasks, projects] = await Promise.all([
    listMeetings(actor, { from, to, mineOnly: filter.mineOnly }),
    listOpenTasks(actor),
    listProjects(actor),
  ]);

  const entries: AgendaEntry[] = [];

  for (const meeting of meetings) {
    entries.push({
      kind: "meeting",
      id: meeting.id,
      day: dayKey(meeting.startsAt, filter.timeZone),
      sortAt: meeting.startsAt.getTime(),
      meeting,
    });
  }

  for (const task of tasks) {
    if (!task.dueDate || task.dueDate < filter.from || task.dueDate >= filter.to) continue;
    const mine = task.assigneeUserId === actor.userId;
    if (filter.mineOnly && !mine) continue;

    entries.push({
      kind: "task",
      id: task.id,
      day: task.dueDate,
      // Deadlines sort above the day's meetings: they frame the day rather
      // than happening at a moment in it.
      sortAt: -1,
      title: task.title,
      status: task.status,
      projectKey: task.projectKey,
      assigneeName: task.assigneeName,
      mine,
    });
  }

  for (const project of projects) {
    if (!project.dueDate || project.dueDate < filter.from || project.dueDate >= filter.to) continue;
    const mine = project.ownerUserId === actor.userId;
    if (filter.mineOnly && !mine) continue;

    entries.push({
      kind: "project",
      id: project.id,
      day: project.dueDate,
      sortAt: -2,
      key: project.key,
      name: project.name,
      mine,
    });
  }

  const byDay = new Map<string, AgendaEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.day) ?? [];
    list.push(entry);
    byDay.set(entry.day, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      entries: list.sort((a, b) => a.sortAt - b.sortAt),
    }));
}
