"use server";

import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { listApprovedLeaveBetween } from "@/lib/data/leave";
import { findConflicts } from "@/lib/data/meetings";
import { eachDay } from "@/lib/leave-days";

/**
 * Who is already booked at that time.
 *
 * A server action rather than a route handler, because it is a question only a
 * signed-in person may ask about their own organization, and `withOrg()` is
 * behind it. The form calls it whenever the time or the guest list changes, so
 * you see the clash while you are still choosing -- the same idea as the
 * project wizard showing each person's workload at the moment you assign them.
 * Finding out after the invitation has gone out is finding out too late.
 *
 * It reads and never writes, so it does not revalidate anything.
 *
 * Two kinds of clash, because they are different problems: somebody already in
 * a meeting can usually be moved, and somebody on holiday cannot. Telling them
 * apart is the difference between "pick another slot" and "pick another week".
 */

const schema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  userIds: z.array(z.uuid()).max(50),
  excludeMeetingId: z.uuid().optional(),
});

export type Conflict = {
  kind: "meeting" | "leave";
  /** The meeting's title. Empty for leave: whose time off and why is theirs. */
  title: string;
  startsAt: string;
};

export type ConflictReport = Record<string, Conflict[]>;

export async function checkConflicts(input: z.input<typeof schema>): Promise<ConflictReport> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return {};

  const session = await requirePermissionForAction("meeting.schedule");

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  const timeZone = session.organization.timezone;

  // The calendar days the meeting touches, so an evening that runs past
  // midnight is checked against both.
  const firstDay = dayKey(startsAt, timeZone);
  const lastDay = dayKey(endsAt, timeZone);

  const [meetings, away] = await Promise.all([
    findConflicts(
      session.actor,
      { startsAt, endsAt },
      parsed.data.userIds,
      parsed.data.excludeMeetingId,
    ),
    listApprovedLeaveBetween(session.actor, firstDay, lastDay),
  ]);

  const report: ConflictReport = {};
  const invited = new Set(parsed.data.userIds);

  for (const conflict of meetings) {
    report[conflict.userId] ??= [];
    report[conflict.userId]!.push({
      kind: "meeting",
      title: conflict.title,
      startsAt: conflict.startsAt.toISOString(),
    });
  }

  const days = new Set(eachDay(firstDay, lastDay));
  for (const request of away) {
    if (!invited.has(request.userId)) continue;
    if (!eachDay(request.startDate, request.endDate).some((day) => days.has(day))) continue;

    report[request.userId] ??= [];
    report[request.userId]!.push({
      kind: "leave",
      title: "",
      startsAt: startsAt.toISOString(),
    });
  }

  return report;
}
