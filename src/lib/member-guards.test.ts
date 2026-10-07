import { describe, expect, it } from "vitest";

import { guardSuspend, mayActOnTarget } from "./member-guards";

/**
 * The guards standing between an admin and somebody else's account.
 *
 * Asserted rather than trusted, because these three refusals are the entire
 * security boundary of the admin panel on a person's page. Each one exists
 * because the act it prevents is unrecoverable from inside the app: taking the
 * owner's account, locking the last owner out, or locking yourself out of the
 * organization you administer.
 */

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-0000000000b1";
const MEMBER = "00000000-0000-4000-8000-0000000000c1";

describe("mayActOnTarget", () => {
  it("refuses an admin acting on an owner", () => {
    // The reason the email path is fenced at all: an admin who can rewrite an
    // owner's sign-in address owns the organization a password reset later.
    expect(mayActOnTarget("owner", "admin")).toBe(false);
  });

  it("lets an owner act on another owner", () => {
    expect(mayActOnTarget("owner", "owner")).toBe(true);
  });

  it("lets an admin act on anyone below an owner", () => {
    for (const role of ["admin", "manager", "member"] as const) {
      expect(mayActOnTarget(role, "admin"), role).toBe(true);
    }
  });
});

describe("guardSuspend", () => {
  /** The ordinary case: an admin suspending a member. Nothing stands in the way. */
  const base = {
    actorUserId: ADMIN,
    actorRole: "admin" as const,
    targetUserId: MEMBER,
    targetRole: "member" as const,
    suspended: true,
    ownerCount: 3,
  };

  it("allows an admin to suspend a member", () => {
    expect(guardSuspend(base)).toBeNull();
  });

  it("refuses suspending yourself", () => {
    // With one admin this would leave the organization with nobody able to
    // undo it, and it is never what was meant.
    expect(guardSuspend({ ...base, targetUserId: ADMIN })).toBe("cannotSuspendSelf");
  });

  it("refuses suspending yourself even as the owner", () => {
    expect(
      guardSuspend({
        ...base,
        actorUserId: OWNER,
        actorRole: "owner",
        targetUserId: OWNER,
        targetRole: "owner",
      }),
    ).toBe("cannotSuspendSelf");
  });

  it("refuses an admin suspending an owner", () => {
    expect(guardSuspend({ ...base, targetUserId: OWNER, targetRole: "owner" })).toBe(
      "onlyOwnerCanEditOwner",
    );
  });

  it("refuses suspending the last owner", () => {
    // An organization whose only owner cannot sign in has no way back that
    // does not involve a SQL client.
    expect(
      guardSuspend({
        ...base,
        actorUserId: OWNER,
        actorRole: "owner",
        targetUserId: MEMBER,
        targetRole: "owner",
        ownerCount: 1,
      }),
    ).toBe("lastOwner");
  });

  it("allows suspending an owner while another remains", () => {
    expect(
      guardSuspend({
        ...base,
        actorUserId: OWNER,
        actorRole: "owner",
        targetUserId: MEMBER,
        targetRole: "owner",
        ownerCount: 2,
      }),
    ).toBeNull();
  });

  it("never blocks reinstating on the owner count", () => {
    // Putting an owner back cannot reduce the number of owners, so the
    // last-owner rule has nothing to protect here.
    expect(
      guardSuspend({
        ...base,
        actorUserId: OWNER,
        actorRole: "owner",
        targetUserId: MEMBER,
        targetRole: "owner",
        suspended: false,
        ownerCount: 0,
      }),
    ).toBeNull();
  });

  it("still refuses an admin reinstating an owner", () => {
    // Reinstating is the gentler half, but it is still an owner's record.
    expect(
      guardSuspend({ ...base, targetUserId: OWNER, targetRole: "owner", suspended: false }),
    ).toBe("onlyOwnerCanEditOwner");
  });

  it("reports self before the owner rule", () => {
    // An owner suspending themselves should hear the useful reason, not the
    // incidental one -- both rules match and the order decides which.
    expect(
      guardSuspend({
        ...base,
        actorUserId: OWNER,
        actorRole: "owner",
        targetUserId: OWNER,
        targetRole: "owner",
        ownerCount: 1,
      }),
    ).toBe("cannotSuspendSelf");
  });
});
