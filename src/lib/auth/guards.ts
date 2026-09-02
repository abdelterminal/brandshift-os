import "server-only";

import { forbidden, unauthorized } from "next/navigation";

import { can, type Action } from "../authz";
import { getCurrentUser, type CurrentUser } from "./session";

/**
 * The two refusals, and why they are different.
 *
 * 401 means "we do not know who you are": the session is missing, expired or
 * revoked, so the cookie is cleared and you are sent to sign in.
 *
 * 403 means "we know exactly who you are, and the answer is no": the session
 * stays untouched. The old app signed people out on a permission error, which
 * lost whatever they were in the middle of and taught them that clicking the
 * wrong thing costs you your work.
 */

export class UnauthorizedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(
    message = "Not allowed",
    readonly action?: Action,
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * How long a re-authentication counts for. Long enough to delete three things
 * in a row without being asked again, short enough that a walked-away laptop
 * is not an open door.
 */
export const REAUTH_WINDOW_MS = 15 * 60 * 1000;

/**
 * The signed-in person, or a 401.
 *
 * For pages. `unauthorized()` renders the nearest `unauthorized.tsx`, which is
 * where the cookie gets cleared and the sign-in link offered.
 */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getCurrentUser();
  if (!session) unauthorized();
  return session;
}

/**
 * The signed-in person with a permission checked, or a 403.
 *
 * Same `can()` the rail calls, so a destination that is hidden and an action
 * that is refused can never disagree.
 */
export async function requirePermission(action: Action, resource?: unknown): Promise<CurrentUser> {
  const session = await requireUser();
  if (!can(session.actor, action, resource)) forbidden();
  return session;
}

/**
 * For Server Actions, which return errors rather than rendering pages.
 *
 * Throwing `unauthorized()` inside an action would try to render a page in a
 * response that is not one, so actions get exceptions they can turn into a
 * result the form knows how to display.
 */
export async function requireUserForAction(): Promise<CurrentUser> {
  const session = await getCurrentUser();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function requirePermissionForAction(
  action: Action,
  resource?: unknown,
): Promise<CurrentUser> {
  const session = await requireUserForAction();
  if (!can(session.actor, action, resource)) {
    throw new ForbiddenError(`Not allowed to ${action}`, action);
  }
  return session;
}

/** Has this session proved the password recently enough for a destructive act? */
export function hasRecentAuth(session: CurrentUser, now = Date.now()): boolean {
  const at = session.session.reauthenticatedAt;
  return at !== null && now - at.getTime() < REAUTH_WINDOW_MS;
}

/**
 * Guard for destructive or sensitive actions only.
 *
 * Routine writes never call this. "NO password prompt to perform a routine
 * write" is a rule because the old app asked on every save, which trained
 * people to type their password without reading what they were confirming --
 * the exact reflex that makes a real confirmation worthless.
 */
export async function requireRecentAuth(): Promise<CurrentUser> {
  const session = await requireUserForAction();
  if (!hasRecentAuth(session)) {
    throw new ReauthRequiredError();
  }
  return session;
}

export class ReauthRequiredError extends Error {
  constructor(message = "Confirm your password to continue") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}
