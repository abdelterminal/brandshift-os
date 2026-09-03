import "server-only";

import { eq, gte, inArray, lte, ne, type SQL } from "drizzle-orm";

import { leaveRequests } from "@/db/schema/leave";
import { memberships, users } from "@/db/schema/people";
import { withOrg, type Executor } from "@/db/tenancy";

import type { Actor } from "../authz";
import { overlaps, workingDays } from "../leave-days";

/**
 * Time off.
 *
 * Two things worth knowing about the shape of this.
 *
 * **A balance is computed, never stored.** It is the allowance on somebody's
 * membership minus the approved annual days in the year. A stored balance is a
 * number that has to be kept in step with the requests it came from, and the
 * first time an approval is withdrawn it is silently wrong.
 *
 * **Only annual leave spends the allowance.** Sick leave is not a budget, and
 * treating it as one is how a company teaches its staff to come in ill.
 */

export type LeaveType = "annual" | "sick" | "unpaid" | "parental" | "other";
export type LeaveStatus = "pending" | "approved" | "declined" | "cancelled";

export type LeaveRow = {
  id: string;
  userId: string;
  userName: string | null;
  avatarUrl: string | null;
  type: LeaveType;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  workingDays: number;
  reason: string | null;
  status: LeaveStatus;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
};

const LEAVE_FIELDS = {
  id: leaveRequests.id,
  userId: leaveRequests.userId,
  userName: users.name,
  avatarUrl: users.avatarUrl,
  type: leaveRequests.type,
  startDate: leaveRequests.startDate,
  endDate: leaveRequests.endDate,
  halfDay: leaveRequests.halfDay,
  workingDays: leaveRequests.workingDays,
  reason: leaveRequests.reason,
  status: leaveRequests.status,
  decidedByUserId: leaveRequests.decidedByUserId,
  decidedAt: leaveRequests.decidedAt,
  decisionNote: leaveRequests.decisionNote,
  createdAt: leaveRequests.createdAt,
};

const USER_JOIN = [
  { table: users, on: eq(users.id, leaveRequests.userId), type: "inner" as const },
];

/** `numeric` comes back from the driver as a string, and a balance cannot be. */
function toRows(rows: Array<Record<string, unknown>>): LeaveRow[] {
  return rows.map((row) => ({
    ...(row as unknown as LeaveRow),
    workingDays: Number(row.workingDays),
  }));
}

async function read(actor: Actor, ...where: Array<SQL | undefined>): Promise<LeaveRow[]> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    leaveRequests,
    LEAVE_FIELDS,
    USER_JOIN,
    ...where,
  );

  return toRows(rows as Array<Record<string, unknown>>).sort(
    (a, b) => b.startDate.localeCompare(a.startDate) || a.userId.localeCompare(b.userId),
  );
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Everything one person has asked for. */
export function listMyLeave(actor: Actor): Promise<LeaveRow[]> {
  return read(actor, eq(leaveRequests.userId, actor.userId));
}

/**
 * What is waiting for a decision.
 *
 * Your own request is never in it. Nobody signs off their own time off, which
 * is a rule the approval action enforces as well -- this only keeps it off a
 * screen it could never be actioned from.
 */
export function listPendingLeave(actor: Actor): Promise<LeaveRow[]> {
  return read(actor, eq(leaveRequests.status, "pending"), ne(leaveRequests.userId, actor.userId));
}

/** One request, for the actions that have to check who it belongs to. */
export async function getLeaveRequest(actor: Actor, id: string): Promise<LeaveRow | null> {
  const rows = await read(actor, eq(leaveRequests.id, id));
  return rows[0] ?? null;
}

/**
 * Who is away between two days.
 *
 * Approved only. A pending request is a plan, not an absence, and putting it on
 * the team's calendar would have people working around time off that nobody has
 * agreed to yet.
 */
export function listApprovedLeaveBetween(
  actor: Actor,
  from: string,
  to: string,
): Promise<LeaveRow[]> {
  return read(
    actor,
    eq(leaveRequests.status, "approved"),
    // Overlap, not containment: a fortnight that starts before the window is
    // still time off during it.
    lte(leaveRequests.startDate, to),
    gte(leaveRequests.endDate, from),
  );
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export type LeaveBalance = {
  userId: string;
  /** Days a year, from the membership. */
  allowance: number;
  /** Approved annual days in this calendar year. */
  taken: number;
  /** Approved annual days still ahead, already committed. */
  booked: number;
  remaining: number;
};

/**
 * What somebody has left this year.
 *
 * Split into taken and booked because "eighteen days left" answers a different
 * question from "eighteen left, six of which are already promised to a holiday
 * in November". The second is the one people plan with.
 */
export async function leaveBalances(
  actor: Actor,
  year: number,
  today: string,
  userIds?: string[],
): Promise<Map<string, LeaveBalance>> {
  const scope = withOrg(actor.organizationId);

  const [allowances, approved] = await Promise.all([
    scope.selectFields(
      memberships,
      { userId: memberships.userId, allowance: memberships.annualLeaveDays },
      eq(memberships.status, "active"),
      userIds && userIds.length > 0 ? inArray(memberships.userId, userIds) : undefined,
    ),
    scope.selectFields(
      leaveRequests,
      {
        userId: leaveRequests.userId,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        workingDays: leaveRequests.workingDays,
      },
      eq(leaveRequests.status, "approved"),
      // Only annual leave spends the allowance.
      eq(leaveRequests.type, "annual"),
      gte(leaveRequests.startDate, `${year}-01-01`),
      lte(leaveRequests.startDate, `${year}-12-31`),
    ),
  ]);

  const balances = new Map<string, LeaveBalance>(
    allowances.map((row) => [
      row.userId,
      {
        userId: row.userId,
        allowance: row.allowance,
        taken: 0,
        booked: 0,
        remaining: row.allowance,
      },
    ]),
  );

  for (const row of approved) {
    const balance = balances.get(row.userId);
    if (!balance) continue;

    const days = Number(row.workingDays);
    // Counted as taken once it has begun. A holiday you are on is not one you
    // are still planning.
    if (row.startDate <= today) balance.taken += days;
    else balance.booked += days;
  }

  for (const balance of balances.values()) {
    balance.remaining = balance.allowance - balance.taken - balance.booked;
  }

  return balances;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type NewLeaveInput = {
  type: LeaveType;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  reason: string | null;
};

/**
 * Whether this person already has time off across any of these days.
 *
 * Checked before the request is written rather than after it is approved: two
 * overlapping requests are not a conflict somebody should discover from a
 * balance that has gone strange.
 */
export async function findOverlappingLeave(
  actor: Actor,
  range: { startDate: string; endDate: string },
  excludeId?: string,
): Promise<LeaveRow[]> {
  const mine = await read(
    actor,
    eq(leaveRequests.userId, actor.userId),
    // A declined or cancelled request is not time off.
    inArray(leaveRequests.status, ["pending", "approved"]),
  );

  return mine.filter((row) => row.id !== excludeId && overlaps(row, range));
}

export async function createLeaveRequest(
  actor: Actor,
  input: NewLeaveInput,
  executor?: Executor,
): Promise<{ id: string; workingDays: number } | null> {
  const days = workingDays(input.startDate, input.endDate, input.halfDay);
  if (days <= 0) return null;

  const [created] = await withOrg(actor.organizationId, executor).insert(leaveRequests, {
    userId: actor.userId,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    halfDay: input.halfDay,
    workingDays: String(days),
    reason: input.reason,
  });

  return created ? { id: created.id, workingDays: days } : null;
}

/**
 * Approve or decline.
 *
 * Filtered on `pending`, so two approvers pressing at the same moment cannot
 * both record a decision -- the second changes nothing and is told so.
 */
export async function decideLeaveRequest(
  actor: Actor,
  id: string,
  decision: "approved" | "declined",
  note: string | null,
): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    leaveRequests,
    {
      status: decision,
      decidedByUserId: actor.userId,
      decidedAt: new Date(),
      decisionNote: note,
      updatedAt: new Date(),
    },
    eq(leaveRequests.id, id),
    eq(leaveRequests.status, "pending"),
    // Nobody signs off their own time off, whatever their role.
    ne(leaveRequests.userId, actor.userId),
  );
  return rows.length > 0;
}

/**
 * Withdraw your own request.
 *
 * Allowed while it is pending, and also after approval: plans change, and a
 * cancelled holiday that stays on the team calendar is worse than one that
 * never happened. It keeps the row either way.
 */
export async function cancelLeaveRequest(actor: Actor, id: string): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    leaveRequests,
    { status: "cancelled", updatedAt: new Date() },
    eq(leaveRequests.id, id),
    eq(leaveRequests.userId, actor.userId),
    inArray(leaveRequests.status, ["pending", "approved"]),
  );
  return rows.length > 0;
}

/** Who may be asked to decide. Used to fan a request out to the right people. */
export async function approverIdsFor(actor: Actor, requesterId: string): Promise<string[]> {
  const rows = await withOrg(actor.organizationId).selectFields(
    memberships,
    { userId: memberships.userId, role: memberships.role, permissions: memberships.permissions },
    eq(memberships.status, "active"),
  );

  return rows
    .filter(
      (row) =>
        row.userId !== requesterId &&
        (row.role === "owner" ||
          row.role === "admin" ||
          row.role === "manager" ||
          row.permissions.people === true),
    )
    .map((row) => row.userId);
}
