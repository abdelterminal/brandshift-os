"use server";

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db/client";
import { findMembershipsForUser, withOrg } from "@/db/tenancy";
import { memberships, users } from "@/db/schema/people";
import { organizations } from "@/db/schema/organizations";
import { sessions } from "@/db/schema/sessions";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";

import {
  clearSessionCookie,
  createSession,
  destroyCurrentSession,
  markReauthenticated,
  revokeOtherSessions,
  revokeSession,
} from "./session";
import { ReauthRequiredError, requireRecentAuth, requireUserForAction } from "./guards";

/**
 * Everything that changes who you are.
 *
 * Each action validates with Zod at the boundary, returns a `FormState` the
 * form can render, and never leaks which half of a credential was wrong -- an
 * error that distinguishes "no such email" from "wrong password" is an account
 * enumeration oracle.
 */

export type FormState = {
  /** Message key, resolved by the form. */
  error?: string;
  /** Per-field message keys. */
  fieldErrors?: Record<string, string>;
  /**
   * Non-secret values echoed back so a rejected form does not make someone
   * retype what was already right. Passwords are never included.
   */
  values?: Record<string, string>;
  ok?: boolean;
};

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const passwordSchema = z.string().min(10).max(200);

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  next: z.string().optional(),
});

/**
 * Only a path within this app, never an absolute URL.
 *
 * `?next=https://evil.example` on a sign-in link is the classic open redirect:
 * the victim signs in on the real site and is handed straight to the attacker's.
 * A leading `//` is the same trick in protocol-relative clothing.
 */
function safeNext(next: string | undefined, locale: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return `/${locale}/today`;
  return `/${locale}${next}`;
}

/**
 * A hash of nothing anyone will ever type, verified when no user matches.
 *
 * Without it, a missing email answers in a millisecond and a wrong password
 * answers in sixty, which tells an attacker which addresses are registered
 * without them ever guessing a password.
 */
const DUMMY_HASH =
  "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$" +
  "Ozs3nP3nZQ3v8h1oR4gYh0m1s8vC7fL2Q8xW9nT4kJ5rQ2mX7pB6yD1cV3aN8sE0";

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "invalidCredentials", values: { email: String(formData.get("email") ?? "") } };
  }

  const [person] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  const stored = person?.passwordHash ?? DUMMY_HASH;
  const valid = await verifyPassword(parsed.data.password, stored);

  if (!person || !valid || person.deactivatedAt) {
    return { error: "invalidCredentials", values: { email: parsed.data.email } };
  }

  // The bootstrap read: which organizations are theirs. It cannot be scoped,
  // because it is what decides the scope -- see findMembershipsForUser().
  const membershipRows = await findMembershipsForUser(person.id);

  // The cost may have been raised since this hash was made; sign-in is the one
  // moment the plaintext is available to upgrade it.
  if (needsRehash(stored)) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.password) })
      .where(eq(users.id, person.id));
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, person.id));
  await createSession(person.id, membershipRows[0]?.organizationId ?? null);

  const locale = await getLocale();
  redirect(safeNext(parsed.data.next, locale));
}

const signUpSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(2).max(120),
});

/** Slug from an org name, made unique by the caller if it collides. */
function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org"
  );
}

export async function signUpWithOrg(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    organizationName: formData.get("organizationName"),
  });

  const echoed = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    organizationName: String(formData.get("organizationName") ?? ""),
  };

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field) fieldErrors[field] = field === "password" ? "passwordTooShort" : "invalid";
    }
    return { fieldErrors, values: echoed };
  }

  const { name, email, password, organizationName } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    return { fieldErrors: { email: "emailTaken" }, values: echoed };
  }

  const passwordHash = await hashPassword(password);

  // One transaction: an organization with no owner, or an owner with no
  // organization, are both states nothing else in the app knows how to handle.
  const created = await db.transaction(async (tx) => {
    let slug = slugify(organizationName);
    const [clash] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug));
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const [organization] = await tx
      .insert(organizations)
      .values({ name: organizationName, slug })
      .returning();

    const [person] = await tx
      .insert(users)
      .values({ name, email, passwordHash })
      .returning();

    // The organization exists by this point, so the membership goes in through
    // the scoped path like every other tenant-owned write.
    await withOrg(organization!.id, tx).insert(memberships, {
      userId: person!.id,
      role: "owner",
      status: "active",
      isFounder: true,
      joinedAt: new Date(),
      // The founder can reach everything; there is nobody else to grant it.
      permissions: { finance: true, people: true, crm: true, insights: true },
    });

    return { organizationId: organization!.id, userId: person!.id };
  });

  await createSession(created.userId, created.organizationId);

  const locale = await getLocale();
  redirect(`/${locale}/today`);
}

/**
 * Drops a cookie that no longer identifies anyone. Called by the 401 page,
 * which cannot write cookies during its own render.
 */
export async function clearSessionCookieAction(): Promise<void> {
  await clearSessionCookie();
}

export async function signOut(): Promise<void> {
  await destroyCurrentSession();
  const locale = await getLocale();
  redirect(`/${locale}/login`);
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  });

/**
 * Changing a password ends every other session.
 *
 * `getCurrentUser()` refuses any session created before `passwordChangedAt`,
 * so this needs no sweep of the sessions table -- except for this device,
 * which is re-issued so the person is not signed out of the browser they are
 * standing in front of.
 */
export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireUserForAction();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field === "confirmPassword") fieldErrors[field] = "mismatch";
      else if (field === "newPassword") fieldErrors[field] = "passwordTooShort";
    }
    return { fieldErrors };
  }

  const [person] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!person) return { error: "invalidCredentials" };

  const valid = await verifyPassword(parsed.data.currentPassword, person.passwordHash);
  if (!valid) return { fieldErrors: { currentPassword: "wrongPassword" } };

  const changedAt = new Date();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.newPassword),
      passwordChangedAt: changedAt,
      updatedAt: changedAt,
    })
    .where(eq(users.id, person.id));

  // Revoke this device's row and issue a fresh one, so the change takes effect
  // everywhere else without signing this person out of where they are.
  await db
    .update(sessions)
    .set({ revokedAt: changedAt })
    .where(eq(sessions.id, session.session.id));
  await createSession(person.id, session.organization.id);

  const locale = await getLocale();
  revalidatePath(`/${locale}/settings`);
  return { ok: true };
}

/** Re-authenticate, opening the window for destructive actions. */
export async function confirmPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireUserForAction();
  const password = String(formData.get("password") ?? "");

  const [person] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!person || !(await verifyPassword(password, person.passwordHash))) {
    return { error: "wrongPassword" };
  }

  await markReauthenticated(session.session.id);
  return { ok: true };
}

/**
 * Revoking a device is destructive -- it locks someone out of a browser they
 * may still be relying on -- so it needs a recent password, not merely a live
 * session. Signing in counts, so this only prompts once the window has passed.
 */
export async function revokeDevice(sessionId: string): Promise<FormState> {
  let session;
  try {
    session = await requireRecentAuth();
  } catch (error) {
    if (error instanceof ReauthRequiredError) return { error: "reauthRequired" };
    throw error;
  }

  if (sessionId === session.session.id) {
    return { error: "cannotRevokeCurrent" };
  }

  const revoked = await revokeSession(session.user.id, sessionId);
  if (!revoked) return { error: "sessionNotFound" };

  const locale = await getLocale();
  revalidatePath(`/${locale}/settings`);
  return { ok: true };
}

/** The big hammer: every other device at once. Same requirement. */
export async function revokeAllOtherDevices(): Promise<FormState> {
  let session;
  try {
    session = await requireRecentAuth();
  } catch (error) {
    if (error instanceof ReauthRequiredError) return { error: "reauthRequired" };
    throw error;
  }

  await revokeOtherSessions(session.user.id, session.session.id);

  const locale = await getLocale();
  revalidatePath(`/${locale}/settings`);
  return { ok: true };
}

/**
 * Switch organization.
 *
 * Not a security boundary -- the membership already decided what you may see --
 * so it changes the session's org rather than asking for a password again.
 */
export async function switchOrganization(organizationId: string): Promise<FormState> {
  const session = await requireUserForAction();

  const allowed = session.organizations.some((org) => org.id === organizationId);
  if (!allowed) return { error: "notAMember" };

  await db
    .update(sessions)
    .set({ organizationId })
    .where(eq(sessions.id, session.session.id));

  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}
