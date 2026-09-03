"use server";

import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { findConflicts } from "@/lib/data/meetings";

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
 */

const schema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  userIds: z.array(z.uuid()).max(50),
  excludeMeetingId: z.uuid().optional(),
});

export type ConflictReport = Record<string, Array<{ title: string; startsAt: string }>>;

export async function checkConflicts(input: z.input<typeof schema>): Promise<ConflictReport> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return {};

  const session = await requirePermissionForAction("meeting.schedule");

  const conflicts = await findConflicts(
    session.actor,
    { startsAt: new Date(parsed.data.startsAt), endsAt: new Date(parsed.data.endsAt) },
    parsed.data.userIds,
    parsed.data.excludeMeetingId,
  );

  const report: ConflictReport = {};
  for (const conflict of conflicts) {
    report[conflict.userId] ??= [];
    report[conflict.userId]!.push({
      title: conflict.title,
      startsAt: conflict.startsAt.toISOString(),
    });
  }
  return report;
}
