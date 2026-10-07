import "server-only";

import { getLocale } from "next-intl/server";
import { forbidden, unauthorized } from "next/navigation";

import { redirect } from "@/i18n/navigation";

import { can, type Action, type Resource } from "../authz";
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

  /*
    A password somebody else chose gets replaced before anything else happens.

    Here rather than in the app layout so it covers every page that asks who
    you are -- the shell, the print routes, anything added later -- instead of
    one group that a future route could be added outside of. It is a gate on
    pages, not on the session: they are signed in, and `/new-password` reads
    that session to know whose password to change.

    That page must therefore not call this function, or it would send itself in
    a circle. It calls `getCurrentUser()` directly, which is the only caller
    that legitimately does.
  */
  if (session.user.mustChangePassword) {
    redirect({ href: "/new-password", locale: await getLocale() });
  }

  return session;
}

/**
 * The signed-in person with a permission checked, or a 403.
 *
 * Same `can()` the rail calls, so a destination that is hidden and an action
 * that is refused can never disagree.
 */
export async function requirePermission(action: Action, resource?: Resource): Promise<CurrentUser> {
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
  resource?: Resource,
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
