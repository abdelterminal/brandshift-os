"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db/client";
import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  cancelMeeting,
  createMeeting,
  getMeeting,
  isValidWindow,
  rescheduleMeeting,
  respondToMeeting,
  saveMeetingNotes,
} from "@/lib/data/meetings";

/**
 * Meeting mutations.
 *
 * Scheduling one is a routine write and asks for no password. Moving or
 * cancelling one is guarded by `meeting.manage` with the meeting itself as the
 * resource -- the first rule in this app that depends on the row rather than
 * on the role alone, which is what `can()`'s resource argument was built for.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const idSchema = z.uuid();

/**
 * A meeting, as a form can express it.
 *
 * Times arrive as `datetime-local` strings, which carry no zone -- the form
 * sends the organization's wall-clock time and the client turns it into an
 * instant before it gets here, so this only has to check that the instant is
 * real and the window makes sense.
 */
const meetingSchema = z.object({
  title: z.string().trim().min(1).max(160),
  agenda: z.string().trim().max(4000).optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  location: z.string().trim().max(400).optional(),
  projectId: z.uuid().nullable().optional(),
  attendeeUserIds: z.array(z.uuid()).max(50),
});

export type MeetingInput = z.input<typeof meetingSchema>;

function revalidateCalendar(locale: string) {
  // The calendar, Today and any project the meeting belongs to all show it, and
  // the inbox badge lives on the layout.
  revalidatePath(`/${locale}`, "layout");
}

export async function scheduleMeeting(input: MeetingInput): Promise<ActionResult> {
  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (!isValidWindow(startsAt, endsAt)) return { ok: false, error: "window" };

  const session = await requirePermissionForAction("meeting.schedule");

  const created = await db.transaction((tx) =>
    createMeeting(
      session.actor,
      {
        title: parsed.data.title,
        agenda: parsed.data.agenda || null,
        startsAt,
        endsAt,
        location: parsed.data.location || null,
        projectId: parsed.data.projectId ?? null,
        attendeeUserIds: parsed.data.attendeeUserIds,
      },
      tx,
    ),
  );

  // Outside the transaction, because the fan-out reads the attendee rows it
  // has just written and everyone expected should hear about it.
  await recordActivity(session.actor, {
    verb: "meeting.scheduled",
    subjectType: "meeting",
    subjectId: created.id,
    projectId: parsed.data.projectId ?? null,
    metadata: { title: parsed.data.title },
  });

  const locale = await getLocale();
  revalidateCalendar(locale);
  redirect(`/${locale}/calendar/${created.id}`);
}

/** Both times move together. Half a reschedule is a meeting nobody can attend. */
const rescheduleSchema = z.object({
  meetingId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export async function rescheduleMeetingAction(
  input: z.input<typeof rescheduleSchema>,
): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (!isValidWindow(startsAt, endsAt)) return { ok: false, error: "window" };

  const session = await requirePermissionForAction("meeting.schedule");

  // Read it first, because whether you may move it depends on who called it.
  const meeting = await getMeeting(session.actor, parsed.data.meetingId);
  if (!meeting) return { ok: false, error: "notFound" };
  await requirePermissionForAction("meeting.manage", meeting);

  const moved = await rescheduleMeeting(session.actor, parsed.data.meetingId, {
    startsAt,
    endsAt,
  });
  if (!moved) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "meeting.rescheduled",
    subjectType: "meeting",
    subjectId: parsed.data.meetingId,
    projectId: meeting.projectId,
    metadata: { title: meeting.title },
  });

  revalidateCalendar(await getLocale());
  return { ok: true };
}

export async function cancelMeetingAction(meetingId: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(meetingId);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("meeting.schedule");

  const meeting = await getMeeting(session.actor, parsed.data);
  if (!meeting) return { ok: false, error: "notFound" };
  await requirePermissionForAction("meeting.manage", meeting);

  const cancelled = await cancelMeeting(session.actor, parsed.data);
  if (!cancelled) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "meeting.cancelled",
    subjectType: "meeting",
    subjectId: parsed.data,
    projectId: meeting.projectId,
    metadata: { title: meeting.title },
  });

  revalidateCalendar(await getLocale());
  return { ok: true };
}

const responseSchema = z.enum(["accepted", "declined", "tentative"]);

/**
 * Yes, no, or maybe.
 *
 * Scoped to the signed-in person in the data layer, so answering on somebody
 * else's behalf changes nothing rather than being refused after the fact. No
 * activity event: an organizer sees the answers on the meeting itself, and a
 * dozen "accepted" notifications would bury the ones that matter.
 */
export async function respondToMeetingAction(
  meetingId: string,
  response: z.input<typeof responseSchema>,
): Promise<ActionResult> {
  const id = idSchema.safeParse(meetingId);
  const answer = responseSchema.safeParse(response);
  if (!id.success || !answer.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("calendar.view");
  const answered = await respondToMeeting(session.actor, id.data, answer.data);
  if (!answered) return { ok: false, error: "notInvited" };

  revalidateCalendar(await getLocale());
  return { ok: true };
}

/**
 * What was decided.
 *
 * Anyone who was there may write them. A meeting where only the organizer can
 * record the outcome is a meeting whose notes never get written.
 */
export async function saveMeetingNotesAction(
  meetingId: string,
  notes: string,
): Promise<ActionResult> {
  const id = idSchema.safeParse(meetingId);
  const text = z.string().max(8000).safeParse(notes);
  if (!id.success || !text.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("calendar.view");

  const meeting = await getMeeting(session.actor, id.data);
  if (!meeting) return { ok: false, error: "notFound" };

  const wasThere =
    meeting.organizerUserId === session.actor.userId ||
    meeting.attendees.some((person) => person.userId === session.actor.userId);
  if (!wasThere) return { ok: false, error: "notInvited" };

  await saveMeetingNotes(session.actor, id.data, text.data.trim());

  revalidateCalendar(await getLocale());
  return { ok: true };
}
