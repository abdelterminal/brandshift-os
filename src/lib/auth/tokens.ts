import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { authTokens, memberships, organizations, users } from "@/db/schema";
import { withOrg } from "@/db/tenancy";
import { digest } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/password";

/**
 * One-time links.
 *
 * An invited person is created with a password hash nothing can match, which
 * was correct and left them with no way in at all: there was no token, no
 * accept route and no reset. The sign-up form has said "you get in by
 * invitation" since M4, and until now that was not true.
 *
 * Only the digest is stored, the same rule as sessions -- a leaked database
 * yields no usable link. The raw token exists once, in the message, and the app
 * cannot read it back afterwards. That is also why an admin resending an invite
 * mints a new one rather than recovering the old.
 */

/** A fortnight. Long enough to survive a holiday, short enough to expire. */
const INVITE_TTL_SECONDS = 14 * 24 * 60 * 60;

/** An hour, because a reset is something somebody asked for a moment ago. */
const RESET_TTL_SECONDS = 60 * 60;

export type TokenPurpose = "invite" | "reset";

export function ttlFor(purpose: TokenPurpose): number {
  return purpose === "invite" ? INVITE_TTL_SECONDS : RESET_TTL_SECONDS;
}

/**
 * Mint a token and return the raw half.
 *
 * 32 bytes of randomness, base64url so it survives being pasted into a URL and
 * back out of an email client that has decided to be helpful about line
 * wrapping.
 */
export async function createToken(
  organizationId: string,
  userId: string,
  purpose: TokenPurpose,
  tx?: Parameters<typeof withOrg>[1],
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");

  // Written directly rather than through `withOrg()`: `auth_tokens` is one of
  // the two documented exceptions in `tenancy.ts`, because a link is looked up
  // by digest by somebody with no session at all. The organization is stamped
  // on explicitly here so the row still knows where it belongs.
  await (tx ?? db).insert(authTokens).values({
    organizationId,
    userId,
    tokenDigest: await digest(raw),
    purpose,
    expiresAt: new Date(Date.now() + ttlFor(purpose) * 1000),
  });

  return raw;
}

export type TokenRefusal = "unknown" | "used" | "expired";

export type TokenCheck =
  | {
      ok: true;
      userId: string;
      organizationId: string;
      organizationName: string;
      name: string;
      email: string;
    }
  | { ok: false; reason: TokenRefusal };

/**
 * Look a token up without spending it.
 *
 * The three refusals are distinguished on purpose. "This link has already been
 * used" and "this link has expired" are things a person can act on -- ask for
 * another -- where a single "invalid" sends them to support. None of the three
 * reveals whether an address exists, because you cannot reach this without
 * already holding a token.
 */
export async function checkToken(raw: string, purpose: TokenPurpose): Promise<TokenCheck> {
  const rows = await db
    .select({
      id: authTokens.id,
      userId: authTokens.userId,
      organizationId: authTokens.organizationId,
      expiresAt: authTokens.expiresAt,
      usedAt: authTokens.usedAt,
      name: users.name,
      email: users.email,
      organizationName: organizations.name,
    })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .innerJoin(organizations, eq(organizations.id, authTokens.organizationId))
    .where(and(eq(authTokens.tokenDigest, await digest(raw)), eq(authTokens.purpose, purpose)))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, reason: "unknown" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    userId: row.userId,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    name: row.name,
    email: row.email,
  };
}

/**
 * Spend a token and set the password.
 *
 * One transaction, and the token is marked used inside it: two browsers racing
 * the same link cannot both set a password, because the second update matches
 * no unused row.
 *
 * An invite also activates the membership. Somebody who has chosen a password
 * has accepted, and leaving them `invited` would mean an accepted invitation
 * that still reads as outstanding on the People screen.
 */
export async function spendToken(
  raw: string,
  purpose: TokenPurpose,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: TokenRefusal }> {
  const check = await checkToken(raw, purpose);
  if (!check.ok) return { ok: false, reason: check.reason };

  const tokenDigest = await digest(raw);
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    const spent = await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.tokenDigest, tokenDigest), isNull(authTokens.usedAt)))
      .returning({ id: authTokens.id });

    // Somebody else got there first.
    if (spent.length === 0) return { ok: false as const, reason: "used" as const };

    await tx
      .update(users)
      .set({
        passwordHash,
        // Every existing session is refused from here, which matters most for a
        // reset: whoever was signed in with the old password is signed out.
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, check.userId));

    if (purpose === "invite") {
      await withOrg(check.organizationId, tx).update(
        memberships,
        { status: "active", joinedAt: new Date(), updatedAt: new Date() },
        eq(memberships.userId, check.userId),
      );
    }

    return { ok: true as const, userId: check.userId };
  });
}
