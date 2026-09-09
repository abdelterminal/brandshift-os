import "server-only";

import { eq, isNull } from "drizzle-orm";

import { activityEvents } from "@/db/schema/activity";
import { channels } from "@/db/schema/channels";
import { notifications } from "@/db/schema/notifications";
import { memberships, users } from "@/db/schema/people";
import { meetingAttendees } from "@/db/schema/meetings";
import { projectMembers, projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { withOrg, type Executor } from "@/db/tenancy";

import type { Actor } from "../authz";

/**
 * The inbox.
 *
 * Two halves: deciding who should hear about an event (the fan-out below), and
 * reading what someone has been told (everything after it).
 *
 * The rule that shapes all of it: **you are never notified of your own
 * action.** An inbox that tells you what you just did is one people learn to
 * ignore, and an ignored inbox is worse than none -- it swallows the message
 * that mattered along with the noise.
 */

export type NotificationRow = {
  id: string;
  readAt: Date | null;
  createdAt: Date;
  verb: string;
  metadata: Record<string, unknown>;
  /**
   * What the event was about. Needed so a notification can send you to the
   * thing itself: without it, anything that is not a task or a project has
   * nowhere to point and lands on Today -- which is a dead end wearing a link.
   */
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
    | "expense"
    | "channel";
  subjectId: string;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  projectKey: string | null;
  /** Set only when `subjectType` is `"channel"` -- what `href()` needs to link there. */
  channelSlug: string | null;
  projectName: string | null;
};

const NOTIFICATION_FIELDS = {
  id: notifications.id,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
  verb: activityEvents.verb,
  metadata: activityEvents.metadata,
  subjectType: activityEvents.subjectType,
  subjectId: activityEvents.subjectId,
  actorName: users.name,
  taskId: activityEvents.taskId,
  taskTitle: tasks.title,
  projectId: activityEvents.projectId,
  projectKey: projects.key,
  projectName: projects.name,
  channelSlug: channels.slug,
};

const NOTIFICATION_JOINS = [
  {
    table: activityEvents,
    on: eq(activityEvents.id, notifications.activityEventId),
    type: "inner" as const,
  },
  // All left: the system can act with no actor, and an event need not be about
  // a task or a project.
  { table: users, on: eq(users.id, activityEvents.actorUserId), type: "left" as const },
  { table: tasks, on: eq(tasks.id, activityEvents.taskId), type: "left" as const },
  // Joined on `subjectId`, which several other subject types also use as
  // their own foreign key -- harmless, since a `channels.id` never collides
  // with a task's or a project's own uuid, and this only ever resolves for
  // an event whose `subjectType` actually is `"channel"`.
  { table: channels, on: eq(channels.id, activityEvents.subjectId), type: "left" as const },
  { table: projects, on: eq(projects.id, activityEvents.projectId), type: "left" as const },
];

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listNotifications(actor: Actor, limit = 50): Promise<NotificationRow[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    notifications,
    NOTIFICATION_FIELDS,
    NOTIFICATION_JOINS,
    eq(notifications.userId, actor.userId),
  )) as NotificationRow[];

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

/**
 * How many are unread.
 *
 * This is the number on the rail, so it has to be a real count of rows someone
 * can go and act on -- not a badge that means "something happened somewhere".
 */
export async function unreadCount(actor: Actor): Promise<number> {
  return withOrg(actor.organizationId).count(
    notifications,
    eq(notifications.userId, actor.userId),
    isNull(notifications.readAt),
  );
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export async function markRead(actor: Actor, notificationId: string): Promise<void> {
  await withOrg(actor.organizationId).update(
    notifications,
    { readAt: new Date() },
    eq(notifications.id, notificationId),
    // Scoped by user as well as by org: one member must not be able to mark
    // another's inbox read.
    eq(notifications.userId, actor.userId),
    isNull(notifications.readAt),
  );
}

export async function markAllRead(actor: Actor): Promise<void> {
  await withOrg(actor.organizationId).update(
    notifications,
    { readAt: new Date() },
    eq(notifications.userId, actor.userId),
    isNull(notifications.readAt),
  );
}

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

/**
 * `metadataAssignee` lets an action pass the person it just assigned, rather
 * than this re-reading the row it was written from.
 */
type EventWithAssignee = {
  verb: string;
  subjectId: string;
  projectId: string | null;
  taskId: string | null;
  metadataAssignee?: string | null;
  /**
   * The whole payload, for the verbs whose recipient is named in it rather
   * than derivable from a project or a task -- a leave decision goes to the
   * person who asked, and only the event knows who that was.
   */
  metadata?: Record<string, unknown>;
};

/**
 * Who should hear about this event.
 *
 * Kept as one readable table rather than scattered through the actions,
 * because "why did I get this?" is a question the answer to should be findable
 * in one place -- and because a rule added next to the code that fires it is a
 * rule nobody else discovers.
 */
async function recipientsFor(
  actor: Actor,
  event: EventWithAssignee,
  executor?: Executor,
): Promise<string[]> {
  const scope = withOrg(actor.organizationId, executor);
  const recipients = new Set<string>();

  /** The person a task is on, if anyone. */
  async function taskAssignee(): Promise<string | null> {
    if (!event.taskId) return null;
    const [task] = await scope.selectFields(
      tasks,
      { assigneeUserId: tasks.assigneeUserId },
      eq(tasks.id, event.taskId),
    );
    return task?.assigneeUserId ?? null;
  }

  /** Whoever runs the project the event belongs to. */
  async function projectOwner(): Promise<string | null> {
    if (!event.projectId) return null;
    const [project] = await scope.selectFields(
      projects,
      { ownerUserId: projects.ownerUserId },
      eq(projects.id, event.projectId),
    );
    return project?.ownerUserId ?? null;
  }

  switch (event.verb) {
    // Being given work is the one thing everybody wants to hear about.
    case "task.assigned": {
      const assignee = event.metadataAssignee ?? (await taskAssignee());
      if (assignee) recipients.add(assignee);
      break;
    }

    // A blocker is a request for help, so it goes to whoever can unblock it.
    case "task.blocked": {
      const [owner, assignee] = await Promise.all([projectOwner(), taskAssignee()]);
      if (owner) recipients.add(owner);
      if (assignee) recipients.add(assignee);
      break;
    }

    // The person waiting on it hears that it moved.
    case "task.unblocked":
    case "task.completed": {
      const owner = await projectOwner();
      if (owner) recipients.add(owner);
      break;
    }

    // Being added to a project is news; creating one is not.
    case "project.created": {
      if (!event.projectId) break;
      const members = await scope.selectFields(
        projectMembers,
        { userId: projectMembers.userId },
        eq(projectMembers.projectId, event.projectId),
      );
      for (const member of members) recipients.add(member.userId);
      break;
    }

    // The person who owns a deal hears when somebody else moves it. Winning
    // and losing are the two everybody in the room wants to know about, but
    // they still go to one person: a company-wide "we won" belongs in a
    // channel, where people can react to it, not in an inbox queue.
    case "deal.won":
    case "deal.lost":
    case "deal.stageChanged": {
      const owner = event.metadata?.ownerUserId;
      if (typeof owner === "string") recipients.add(owner);
      break;
    }

    // A request nobody is told about is one that sits pending until the
    // person chases it in the corridor.
    case "leave.requested": {
      const { approverIdsFor } = await import("./leave");
      for (const approver of await approverIdsFor(actor, actor.userId)) {
        recipients.add(approver);
      }
      break;
    }

    // The answer goes to whoever asked, and to nobody else: an approval is
    // between two people.
    case "leave.approved":
    case "leave.declined": {
      const requester = event.metadata?.requesterUserId;
      if (typeof requester === "string") recipients.add(requester);
      break;
    }

    // Whoever agreed to it should know it is not happening, so the team
    // calendar and their memory of it do not disagree.
    case "leave.cancelled": {
      const approver = event.metadata?.approverUserId;
      if (typeof approver === "string") recipients.add(approver);
      break;
    }

    // A request nobody with the standing to answer is told about sits
    // pending forever. Two kinds of "standing" here, not one: every
    // admin/owner in the org, the same population `member.editRole` and
    // `organization.editSettings` already trust with org-wide decisions, plus
    // whoever actually made this specific channel -- `channel.manageMembers`'s
    // own two-part rule, echoed here rather than re-derived from it.
    case "channel.joinRequested": {
      const [channel, admins] = await Promise.all([
        scope.selectFields(
          channels,
          { createdByUserId: channels.createdByUserId },
          eq(channels.id, event.subjectId),
        ),
        scope.selectFields(
          memberships,
          { userId: memberships.userId, role: memberships.role },
          eq(memberships.status, "active"),
        ),
      ]);
      if (channel[0]?.createdByUserId) recipients.add(channel[0].createdByUserId);
      for (const row of admins) {
        if (row.role === "owner" || row.role === "admin") recipients.add(row.userId);
      }
      break;
    }

    // The answer goes to whoever asked, and to nobody else -- same shape as
    // `leave.approved`/`leave.declined` just above.
    case "channel.joinApproved":
    case "channel.joinDeclined": {
      const requester = event.metadata?.requesterUserId;
      if (typeof requester === "string") recipients.add(requester);
      break;
    }

    // A meeting moves other people's day, so everyone expected at it hears
    // when it is called, moved or called off. This is the one thing on the
    // calendar that is not simply a deadline somebody can already see.
    case "meeting.scheduled":
    case "meeting.rescheduled":
    case "meeting.cancelled": {
      const invited = await scope.selectFields(
        meetingAttendees,
        { userId: meetingAttendees.userId },
        eq(meetingAttendees.meetingId, event.subjectId),
      );
      for (const attendee of invited) recipients.add(attendee.userId);
      break;
    }

    // What you may do has changed, which you should not have to discover.
    case "member.roleChanged": {
      recipients.add(event.subjectId);
      break;
    }

    default:
      break;
  }

  // Never tell someone what they just did.
  recipients.delete(actor.userId);
  return [...recipients];
}

/**
 * Fan one event out to the people who should hear about it.
 *
 * Called by `recordActivity`, so an action cannot record something and forget
 * to notify anyone -- there is one entry point and it does both.
 */
export async function fanOut(
  actor: Actor,
  activityEventId: string,
  event: EventWithAssignee,
  executor?: Executor,
): Promise<void> {
  const recipients = await recipientsFor(actor, event, executor);
  if (recipients.length === 0) return;

  await withOrg(actor.organizationId, executor).insert(
    notifications,
    recipients.map((userId) => ({ userId, activityEventId })),
  );
}
