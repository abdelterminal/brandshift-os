import "server-only";

import { eq, gte, inArray, isNull, lt, ne, type SQL } from "drizzle-orm";

import { meetingAttendees, meetings, type MeetingResponse } from "@/db/schema/meetings";
import { users } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { withOrg, type Executor } from "@/db/tenancy";

import type { Actor } from "../authz";

/**
 * Meetings.
 *
 * The only thing on the calendar this app owns. Task deadlines and project
 * dates are read where they already live rather than copied here -- see
 * `calendar.ts`.
 *
 * Two rules shape the rest of it:
 *
 * **A cancelled meeting keeps its row.** People blocked an hour out for it,
 * and one that vanishes silently is one they still turn up to.
 *
 * **`needs_action` is a real answer, not a missing one.** An organizer needs
 * to see who has not replied, which a null would hide behind "no response
 * recorded" -- indistinguishable from a bug.
 */

export type { MeetingResponse };

export type MeetingRow = {
  id: string;
  title: string;
  agenda: string | null;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  notes: string | null;
  cancelledAt: Date | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  organizerUserId: string;
  organizerName: string | null;
};

const MEETING_FIELDS = {
  id: meetings.id,
  title: meetings.title,
  agenda: meetings.agenda,
  startsAt: meetings.startsAt,
  endsAt: meetings.endsAt,
  location: meetings.location,
  notes: meetings.notes,
  cancelledAt: meetings.cancelledAt,
  projectId: meetings.projectId,
  projectKey: projects.key,
  projectName: projects.name,
  organizerUserId: meetings.organizerUserId,
  organizerName: users.name,
};

const MEETING_JOINS = [
  // Left: a meeting need not be about a project.
  { table: projects, on: eq(projects.id, meetings.projectId), type: "left" as const },
  { table: users, on: eq(users.id, meetings.organizerUserId), type: "inner" as const },
];

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type AttendeeRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  response: MeetingResponse;
};

export type MeetingWithAttendees = MeetingRow & {
  attendees: AttendeeRow[];
  /** This person's own answer, or null if they were not invited. */
  myResponse: MeetingResponse | null;
};

/** Everyone expected at these meetings, keyed by meeting. */
async function attendeesFor(
  actor: Actor,
  meetingIds: string[],
): Promise<Map<string, AttendeeRow[]>> {
  if (meetingIds.length === 0) return new Map();

  const rows = await withOrg(actor.organizationId).selectJoined(
    meetingAttendees,
    {
      meetingId: meetingAttendees.meetingId,
      userId: meetingAttendees.userId,
      response: meetingAttendees.response,
      name: users.name,
      avatarUrl: users.avatarUrl,
    },
    [{ table: users, on: eq(users.id, meetingAttendees.userId), type: "inner" as const }],
    inArray(meetingAttendees.meetingId, meetingIds),
  );

  const byMeeting = new Map<string, AttendeeRow[]>();
  for (const row of rows) {
    const list = byMeeting.get(row.meetingId) ?? [];
    list.push({
      userId: row.userId,
      name: row.name,
      avatarUrl: row.avatarUrl,
      response: row.response as MeetingResponse,
    });
    byMeeting.set(row.meetingId, list);
  }

  for (const list of byMeeting.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return byMeeting;
}

function withAttendees(
  rows: MeetingRow[],
  byMeeting: Map<string, AttendeeRow[]>,
  userId: string,
): MeetingWithAttendees[] {
  return rows.map((row) => {
    const attendees = byMeeting.get(row.id) ?? [];
    return {
      ...row,
      attendees,
      myResponse: attendees.find((person) => person.userId === userId)?.response ?? null,
    };
  });
}

export type MeetingWindow = {
  /** Inclusive. */
  from: Date;
  /** Exclusive, so a day is `[00:00, next 00:00)` and nothing lands twice. */
  to: Date;
  /** Only meetings this person is expected at, or called. */
  mineOnly?: boolean;
  /** Cancelled meetings are shown, struck through, unless asked otherwise. */
  includeCancelled?: boolean;
};

/**
 * Meetings that overlap a window.
 *
 * Overlap, not containment: a meeting that started before the window and runs
 * into it is happening during the window, and a calendar that hides it because
 * it began yesterday is a calendar that loses the all-morning workshop.
 */
export async function listMeetings(
  actor: Actor,
  window: MeetingWindow,
): Promise<MeetingWithAttendees[]> {
  const conditions: Array<SQL | undefined> = [
    lt(meetings.startsAt, window.to),
    gte(meetings.endsAt, window.from),
    window.includeCancelled === false ? isNull(meetings.cancelledAt) : undefined,
  ];

  const rows = (await withOrg(actor.organizationId).selectJoined(
    meetings,
    MEETING_FIELDS,
    MEETING_JOINS,
    ...conditions,
  )) as MeetingRow[];

  const byMeeting = await attendeesFor(
    actor,
    rows.map((row) => row.id),
  );

  const visible = window.mineOnly
    ? rows.filter(
        (row) =>
          row.organizerUserId === actor.userId ||
          (byMeeting.get(row.id) ?? []).some((person) => person.userId === actor.userId),
      )
    : rows;

  return withAttendees(visible, byMeeting, actor.userId).sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.title.localeCompare(b.title),
  );
}

export async function getMeeting(
  actor: Actor,
  meetingId: string,
): Promise<MeetingWithAttendees | null> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    meetings,
    MEETING_FIELDS,
    MEETING_JOINS,
    eq(meetings.id, meetingId),
  )) as MeetingRow[];

  if (!rows[0]) return null;

  const byMeeting = await attendeesFor(actor, [rows[0].id]);
  return withAttendees(rows, byMeeting, actor.userId)[0] ?? null;
}

/** A project's meetings, for its own page. */
export async function listProjectMeetings(
  actor: Actor,
  projectId: string,
): Promise<MeetingWithAttendees[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    meetings,
    MEETING_FIELDS,
    MEETING_JOINS,
    eq(meetings.projectId, projectId),
  )) as MeetingRow[];

  const byMeeting = await attendeesFor(
    actor,
    rows.map((row) => row.id),
  );

  return withAttendees(rows, byMeeting, actor.userId).sort(
    (a, b) => b.startsAt.getTime() - a.startsAt.getTime(),
  );
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

export type Conflict = { userId: string; meetingId: string; title: string; startsAt: Date };

/**
 * Who is already busy at that time.
 *
 * Shown while you are picking attendees, not after you have sent the invitation
 * -- the same idea as the project wizard showing each person's workload at the
 * moment you assign them. Finding out afterwards is finding out too late.
 *
 * A declined meeting is not a conflict: they already said they were not going.
 */
export async function findConflicts(
  actor: Actor,
  when: { startsAt: Date; endsAt: Date },
  userIds: string[],
  excludeMeetingId?: string,
): Promise<Conflict[]> {
  if (userIds.length === 0) return [];

  const rows = await withOrg(actor.organizationId).selectJoined(
    meetingAttendees,
    {
      userId: meetingAttendees.userId,
      meetingId: meetingAttendees.meetingId,
      title: meetings.title,
      startsAt: meetings.startsAt,
    },
    [{ table: meetings, on: eq(meetings.id, meetingAttendees.meetingId), type: "inner" as const }],
    inArray(meetingAttendees.userId, userIds),
    ne(meetingAttendees.response, "declined"),
    isNull(meetings.cancelledAt),
    lt(meetings.startsAt, when.endsAt),
    gte(meetings.endsAt, when.startsAt),
    excludeMeetingId ? ne(meetings.id, excludeMeetingId) : undefined,
  );

  return rows.map((row) => ({
    userId: row.userId,
    meetingId: row.meetingId,
    title: row.title,
    startsAt: row.startsAt,
  }));
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type NewMeetingInput = {
  title: string;
  agenda: string | null;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  projectId: string | null;
  attendeeUserIds: string[];
};

/**
 * Put a meeting in the diary.
 *
 * The organizer is always an attendee. A meeting whose caller is not on the
 * list is one that does not appear on their own calendar, which is how people
 * miss the thing they arranged.
 */
export async function createMeeting(
  actor: Actor,
  input: NewMeetingInput,
  executor?: Executor,
): Promise<{ id: string }> {
  const scope = withOrg(actor.organizationId, executor);

  const [created] = await scope.insert(meetings, {
    title: input.title,
    agenda: input.agenda,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: input.location,
    projectId: input.projectId,
    organizerUserId: actor.userId,
    createdByUserId: actor.userId,
  });
  if (!created) throw new Error("Could not create the meeting.");

  const invited = new Set(input.attendeeUserIds);
  invited.add(actor.userId);

  await scope.insert(
    meetingAttendees,
    [...invited].map((userId) => ({
      meetingId: created.id,
      userId,
      // The organizer is going; that is what calling it means.
      response: userId === actor.userId ? ("accepted" as const) : ("needs_action" as const),
      respondedAt: userId === actor.userId ? new Date() : null,
    })),
  );

  return { id: created.id };
}

export async function rescheduleMeeting(
  actor: Actor,
  meetingId: string,
  when: { startsAt: Date; endsAt: Date },
): Promise<boolean> {
  const scope = withOrg(actor.organizationId);

  const [updated] = await scope.update(
    meetings,
    { startsAt: when.startsAt, endsAt: when.endsAt, updatedAt: new Date() },
    eq(meetings.id, meetingId),
    isNull(meetings.cancelledAt),
  );
  if (!updated) return false;

  // Everyone answers again. A yes was a yes to a time, and carrying it over to
  // a different one puts people in a meeting they never agreed to.
  await scope.update(
    meetingAttendees,
    { response: "needs_action", respondedAt: null },
    eq(meetingAttendees.meetingId, meetingId),
    ne(meetingAttendees.userId, updated.organizerUserId),
  );

  return true;
}

export async function cancelMeeting(actor: Actor, meetingId: string): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    meetings,
    { cancelledAt: new Date(), updatedAt: new Date() },
    eq(meetings.id, meetingId),
    isNull(meetings.cancelledAt),
  );
  return rows.length > 0;
}

export async function respondToMeeting(
  actor: Actor,
  meetingId: string,
  response: MeetingResponse,
): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    meetingAttendees,
    { response, respondedAt: new Date() },
    eq(meetingAttendees.meetingId, meetingId),
    // Scoped by user as well: nobody answers on somebody else's behalf.
    eq(meetingAttendees.userId, actor.userId),
  );
  return rows.length > 0;
}

/** What was decided. The reason a past meeting is worth keeping. */
export async function saveMeetingNotes(
  actor: Actor,
  meetingId: string,
  notes: string,
): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    meetings,
    { notes: notes || null, updatedAt: new Date() },
    eq(meetings.id, meetingId),
  );
  return rows.length > 0;
}

/** Everyone who should hear that this meeting changed, the organizer aside. */
export async function attendeeIdsFor(actor: Actor, meetingId: string): Promise<string[]> {
  const rows = await withOrg(actor.organizationId).selectFields(
    meetingAttendees,
    { userId: meetingAttendees.userId },
    eq(meetingAttendees.meetingId, meetingId),
  );
  return rows.map((row) => row.userId);
}

/** Meetings someone is expected at, from now on. Used by Today. */
export async function nextMeetingsFor(
  actor: Actor,
  from: Date,
  limit = 3,
): Promise<MeetingWithAttendees[]> {
  const upcoming = await listMeetings(actor, {
    from,
    // A week is the horizon that answers "what is coming"; beyond that it is
    // the calendar's job, not a panel on Today.
    to: new Date(from.getTime() + 7 * 86_400_000),
    mineOnly: true,
    includeCancelled: false,
  });

  return upcoming
    .filter(
      (meeting) => meeting.endsAt >= from && (meeting.myResponse ?? "needs_action") !== "declined",
    )
    .slice(0, limit);
}

/** Both halves of "is this person free", for the schedule form. */
export function conflictsByUser(conflicts: Conflict[]): Map<string, Conflict[]> {
  const byUser = new Map<string, Conflict[]>();
  for (const conflict of conflicts) {
    const list = byUser.get(conflict.userId) ?? [];
    list.push(conflict);
    byUser.set(conflict.userId, list);
  }
  return byUser;
}

/** Guard against the two ways a time range can be nonsense. */
export function isValidWindow(startsAt: Date, endsAt: Date): boolean {
  return (
    Number.isFinite(startsAt.getTime()) &&
    Number.isFinite(endsAt.getTime()) &&
    endsAt.getTime() > startsAt.getTime() &&
    endsAt.getTime() - startsAt.getTime() <= 12 * 3_600_000
  );
}
