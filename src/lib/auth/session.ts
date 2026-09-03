import "server-only";

import { and, desc, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { db } from "@/db/client";
import { sessions } from "@/db/schema/sessions";
import { users } from "@/db/schema/people";
import { findMembershipsForUser } from "@/db/tenancy";

import type { Actor } from "../authz";
import {
  SESSION_COOKIE,
  digest,
  newJti,
  sessionTtlSeconds,
  signSessionToken,
  verifySessionToken,
} from "./jwt";

/**
 * The server half of authentication.
 *
 * Every read here checks four things, and all four matter:
 *   1. the JWT verifies       -- the cookie was issued by us
 *   2. a session row matches  -- it has not been revoked
 *   3. the row has not expired
 *   4. it predates no password change -- changing a password signs out
 *      every other device, which is the point of changing it
 */

export type SessionRecord = {
  id: string;
  userId: string;
  organizationId: string | null;
  reauthenticatedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

export type CurrentUser = {
  actor: Actor;
  session: SessionRecord;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    locale: "en" | "fr" | null;
  };
  membership: {
    role: Actor["role"];
    jobTitle: string | null;
    departmentId: string | null;
  };
  // The timezone comes with it, because every date this app shows is a date
  // in the organization's zone -- not the server's, and not the browser's.
  organization: { id: string; name: string; slug: string; timezone: string };
  organizations: Array<{ id: string; name: string; slug: string }>;
};

// ---------------------------------------------------------------------------
// Creating and ending sessions
// ---------------------------------------------------------------------------

/**
 * Issues a session and sets the cookie.
 *
 * `organizationId` is the org the session starts in; the switcher changes it
 * without re-authenticating, because which tenant you are looking at is not a
 * security boundary you cross -- your membership already decided that.
 */
export async function createSession(
  userId: string,
  organizationId: string | null,
): Promise<string> {
  const jti = newJti();
  const ttl = sessionTtlSeconds();
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const requestHeaders = await headers();

  await db.insert(sessions).values({
    userId,
    organizationId,
    tokenDigest: await digest(jti),
    userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
    ipAddress:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-real-ip") ??
      null,
    // Signing in *is* authenticating, so the re-auth window starts now.
    reauthenticatedAt: new Date(),
    expiresAt,
  });

  const token = await signSessionToken({ sub: userId, jti });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // The LAN deployment is plain HTTP, so forcing Secure would silently drop
    // the cookie and make sign-in fail with no visible reason.
    secure: process.env.NODE_ENV === "production" && process.env.HTTPS === "true",
    path: "/",
    maxAge: ttl,
  });

  return token;
}

/** Ends the current session everywhere: the row is revoked and the cookie cleared. */
export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    const claims = await verifySessionToken(token);
    if (claims) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenDigest, await digest(claims.jti)));
    }
  }

  jar.delete(SESSION_COOKIE);
}

/** Clears the cookie without touching the database. For a token already dead. */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

// ---------------------------------------------------------------------------
// Reading the session
// ---------------------------------------------------------------------------

/**
 * The signed-in person, or `null`.
 *
 * Returns `null` for every kind of failure -- no cookie, bad signature,
 * expired, revoked, password changed, membership removed. Callers that need
 * someone signed in use `requireUser()`; callers that merely want to know use
 * this.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const now = new Date();
  const tokenDigest = await digest(claims.jti);

  const [row] = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenDigest, tokenDigest),
        eq(sessions.userId, claims.sub),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        // A password change invalidates every session issued before it.
        lt(users.passwordChangedAt, sessions.createdAt),
        isNull(users.deactivatedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const memberships = await findMembershipsForUser(row.user.id);
  if (memberships.length === 0) return null;

  // The session's org if it is still one of theirs, otherwise their first.
  const current =
    memberships.find((m) => m.organizationId === row.session.organizationId) ?? memberships[0]!;

  return {
    actor: {
      userId: row.user.id,
      organizationId: current.organizationId,
      role: current.role,
      permissions: current.permissions,
    },
    session: {
      id: row.session.id,
      userId: row.session.userId,
      organizationId: row.session.organizationId,
      reauthenticatedAt: row.session.reauthenticatedAt,
      createdAt: row.session.createdAt,
      expiresAt: row.session.expiresAt,
    },
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      avatarUrl: row.user.avatarUrl,
      locale: row.user.locale,
    },
    membership: {
      role: current.role,
      jobTitle: current.jobTitle,
      departmentId: current.departmentId,
    },
    organization: {
      id: current.organizationId,
      name: current.organizationName,
      slug: current.organizationSlug,
      timezone: current.organizationTimezone,
    },
    organizations: memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
      slug: m.organizationSlug,
    })),
  };
}

/** Touch `last_seen_at` so the session list can say when a device was last used. */
export async function touchSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
}

// ---------------------------------------------------------------------------
// Managing other devices
// ---------------------------------------------------------------------------

export type DeviceSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  current: boolean;
};

/** Every live session for one person, newest first. */
export async function listSessions(
  userId: string,
  currentSessionId: string,
): Promise<DeviceSession[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sessions.lastSeenAt));

  return rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    current: row.id === currentSessionId,
  }));
}

/** Revoke one device. Scoped by user id so nobody can revoke someone else's. */
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  return revoked.length > 0;
}

/** Revoke every session but one -- what "sign out everywhere else" does. */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        ne(sessions.id, keepSessionId),
      ),
    )
    .returning({ id: sessions.id });

  return revoked.length;
}

/** Mark the current session as freshly re-authenticated. */
export async function markReauthenticated(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ reauthenticatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}
