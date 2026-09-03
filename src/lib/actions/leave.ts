"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  decideLeaveRequest,
  findOverlappingLeave,
  getLeaveRequest,
} from "@/lib/data/leave";
import { isValidRange, workingDays } from "@/lib/leave-days";

/**
 * Time-off mutations.
 *
 * Asking is a routine write. Deciding is guarded by `leave.approve` with the
 * request itself as the resource, because "never your own" is a fact about the
 * row rather than about the role -- the second rule in this app to need that,
 * after moving a meeting.
 *
 * Nobody is asked for a password anywhere here. Approving somebody's holiday
 * is not a destructive act.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const idSchema = z.uuid();

const requestSchema = z.object({
  type: z.enum(["annual", "sick", "unpaid", "parental", "other"]),
  startDate: z.string(),
  endDate: z.string(),
  halfDay: z.boolean().optional(),
  reason: z.string().trim().max(2000).optional(),
});

export type LeaveInput = z.input<typeof requestSchema>;

async function revalidateLeaveViews() {
  // The time-off screen, the calendar, Today and the inbox badge on the
  // layout all move when a request is made or decided.
  revalidatePath(`/${await getLocale()}`, "layout");
}

export async function requestLeave(input: LeaveInput): Promise<ActionResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { type, startDate, endDate } = parsed.data;
  if (!isValidRange(startDate, endDate)) return { ok: false, error: "range" };

  const halfDay = parsed.data.halfDay === true && startDate === endDate;

  // A request that costs nothing is a request for a weekend, which is nobody's
  // to give. Better refused with a reason than stored as zero days.
  if (workingDays(startDate, endDate, halfDay) <= 0) {
    return { ok: false, error: "noWorkingDays" };
  }

  const session = await requirePermissionForAction("leave.request");

  const clashes = await findOverlappingLeave(session.actor, { startDate, endDate });
  if (clashes.length > 0) return { ok: false, error: "overlap" };

  const created = await createLeaveRequest(session.actor, {
    type,
    startDate,
    endDate,
    halfDay,
    reason: parsed.data.reason?.trim() || null,
  });
  if (!created) return { ok: false, error: "noWorkingDays" };

  // Everyone who could decide hears about it. A request nobody is told about
  // is a request that sits pending until the person chases it in person.
  await recordActivity(session.actor, {
    verb: "leave.requested",
    subjectType: "leave",
    subjectId: created.id,
    metadata: { days: created.workingDays, type, startDate, endDate },
  });

  await revalidateLeaveViews();
  return { ok: true, id: created.id };
}

const decisionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["approved", "declined"]),
  note: z.string().trim().max(2000).optional(),
});

export async function decideLeave(input: z.input<typeof decisionSchema>): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  // Read it first: whether you may decide depends on whose request it is.
  const session = await requirePermissionForAction("leave.view");
  const request = await getLeaveRequest(session.actor, parsed.data.id);
  if (!request) return { ok: false, error: "notFound" };

  await requirePermissionForAction("leave.approve", { userId: request.userId });

  const decided = await decideLeaveRequest(
    session.actor,
    parsed.data.id,
    parsed.data.decision,
    parsed.data.note?.trim() || null,
  );
  // Already decided by somebody else, or it is your own. Either way nothing
  // changed and saying so beats reporting a success that did not happen.
  if (!decided) return { ok: false, error: "alreadyDecided" };

  await recordActivity(session.actor, {
    verb: parsed.data.decision === "approved" ? "leave.approved" : "leave.declined",
    subjectType: "leave",
    subjectId: parsed.data.id,
    // The person the decision is about, so the fan-out knows whom to tell.
    metadata: {
      requesterUserId: request.userId,
      days: request.workingDays,
      startDate: request.startDate,
      endDate: request.endDate,
    },
  });

  await revalidateLeaveViews();
  return { ok: true };
}

/**
 * Withdraw your own request.
 *
 * Allowed after approval as well as before it: plans change, and time off
 * still on the team's calendar that nobody is taking is worse than a request
 * that was never made. Scoped to the requester in the data layer.
 */
export async function cancelLeave(id: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("leave.request");
  const request = await getLeaveRequest(session.actor, parsed.data);
  if (!request) return { ok: false, error: "notFound" };

  const cancelled = await cancelLeaveRequest(session.actor, parsed.data);
  if (!cancelled) return { ok: false, error: "notFound" };

  // Only worth telling anybody if somebody had already agreed to it.
  if (request.status === "approved") {
    await recordActivity(session.actor, {
      verb: "leave.cancelled",
      subjectType: "leave",
      subjectId: parsed.data,
      metadata: {
        approverUserId: request.decidedByUserId,
        startDate: request.startDate,
        endDate: request.endDate,
      },
    });
  }

  await revalidateLeaveViews();
  return { ok: true };
}
