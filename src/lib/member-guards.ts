import type { Role } from "@/db/schema/people";

/**
 * The rules about *who you are acting on*, as pure functions.
 *
 * `authz.ts` answers "may this actor do this kind of thing at all" and takes
 * only an actor -- `can(actor, "member.suspend")`. It deliberately knows
 * nothing about targets. But these three refusals all depend on the other
 * person: an admin may suspend people in general and still not be allowed to
 * suspend *this* one. That second question has no place in `can()`'s signature,
 * so it lives here instead of being inlined in `actions/people.ts` where
 * `updateMemberRole` first grew it.
 *
 * Pure and dependency-free on purpose: these are the security boundary of the
 * whole admin panel, and a test for them should not need a database, a session
 * or a transaction. The actions below call exactly these functions, so what the
 * tests assert is what production runs.
 */

/** Every way acting on another member can be refused, as a `People` message key. */
export type MemberGuardError =
  | "onlyOwnerCanEditOwner"
  | "lastOwner"
  | "cannotSuspendSelf";

/**
 * An owner is an owner's business.
 *
 * Without this an admin could rewrite an owner's sign-in address and take the
 * organization's most privileged account -- the whole reason the email path is
 * fenced. The same rule `updateMemberRole` has always applied.
 */
export function mayActOnTarget(targetRole: Role, actorRole: Role): boolean {
  return targetRole !== "owner" || actorRole === "owner";
}

/**
 * May this actor suspend (or reinstate) this person?
 *
 * `ownerCount` is how many owners the organization currently has, and is only
 * consulted when the last one is about to lose access -- an organization with
 * nobody who can undo it is unrecoverable without database access.
 *
 * Reinstating is not guarded by the owner count: putting an owner back can
 * never leave the org with fewer of them.
 */
export function guardSuspend({
  actorUserId,
  actorRole,
  targetUserId,
  targetRole,
  suspended,
  ownerCount,
}: {
  actorUserId: string;
  actorRole: Role;
  targetUserId: string;
  targetRole: Role;
  /** `true` to take access away, `false` to give it back. */
  suspended: boolean;
  ownerCount: number;
}): MemberGuardError | null {
  // Checked before the owner rule so an owner suspending themselves is told
  // the useful thing ("not yourself") rather than the incidental one.
  if (actorUserId === targetUserId) return "cannotSuspendSelf";
  if (!mayActOnTarget(targetRole, actorRole)) return "onlyOwnerCanEditOwner";
  if (suspended && targetRole === "owner" && ownerCount <= 1) return "lastOwner";
  return null;
}
