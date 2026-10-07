"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { authTokens } from "@/db/schema/mail";
import { departments, memberships, users, type ModulePermissions } from "@/db/schema/people";
import { withOrg } from "@/db/tenancy";
import {
  ReauthRequiredError,
  requirePermissionForAction,
  requireRecentAuth,
} from "@/lib/auth/guards";
import { revokeAllSessions } from "@/lib/auth/session";
import { recordActivity } from "@/lib/data/activity";
import { guardSuspend, mayActOnTarget } from "@/lib/member-guards";
import { createToken } from "@/lib/auth/tokens";
import { inviteMessage } from "@/lib/mail/templates";
import { flush, queue } from "@/lib/mail/transport";
import { hashPassword } from "@/lib/password";
import { generateTempPassword } from "@/lib/temp-password";
import { slugify } from "@/lib/slug";

/**
 * People mutations: inviting someone, and changing what they may do.
 *
 * Both go through `can()` rather than checking roles inline, so the button
 * that is hidden and the action that refuses are deciding on the same rule.
 */

export type PeopleResult =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["owner", "admin", "manager", "member"]).default("member"),
  departmentId: z.union([z.uuid(), z.literal("")]).optional(),
  jobTitle: z.string().trim().max(120).optional(),
});

/**
 * Invite someone into this organization.
 *
 * The membership is created as `invited`, not `active`: they exist in the
 * directory and can be assigned work, but they have not accepted yet. There is
 * no email out yet -- that arrives with Inbox and notifications in Phase 2 --
 * so the invite is created with an unusable password and shows as pending
 * rather than pretending a message was sent.
 */
export async function invitePerson(formData: FormData): Promise<PeopleResult> {
  const session = await requirePermissionForAction("member.invite");

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role") ?? "member",
    departmentId: formData.get("departmentId") ?? "",
    jobTitle: formData.get("jobTitle") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field) fieldErrors[field] = "invalid";
    }
    return { ok: false, error: "invalid", fieldErrors };
  }

  // Only an owner can mint another owner; otherwise an admin could promote
  // themselves past the person who created the organization.
  if (parsed.data.role === "owner" && session.actor.role !== "owner") {
    return { ok: false, error: "onlyOwnerCanInviteOwner" };
  }

  const data = parsed.data;

  const created = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    // Identity is global: someone who already has an account elsewhere joins
    // this organization rather than getting a second account.
    const userId =
      existing?.id ??
      (
        await tx
          .insert(users)
          .values({
            email: data.email,
            name: data.name,
            // Unusable until they set one. `verifyPassword` cannot match it.
            passwordHash: await hashPassword(crypto.randomUUID() + crypto.randomUUID()),
          })
          .returning()
      )[0]!.id;

    const txScope = withOrg(session.actor.organizationId, tx);

    const alreadyMember = await txScope.selectFields(
      memberships,
      { id: memberships.id },
      eq(memberships.userId, userId),
    );
    if (alreadyMember.length > 0) return null;

    const [membership] = await txScope.insert(memberships, {
      userId,
      role: data.role,
      status: "invited",
      departmentId: data.departmentId || null,
      jobTitle: data.jobTitle || null,
      permissions: {},
    });

    // Minted in the same transaction as the membership: an invitation that
    // exists without a way to accept it is the state this whole change is
    // fixing, and it should not be reachable even by a crash.
    const token = await createToken(session.actor.organizationId, userId, "invite", tx);

    return { userId, membershipId: membership!.id, token };
  });

  if (!created)
    return { ok: false, error: "alreadyMember", fieldErrors: { email: "alreadyMember" } };

  await recordActivity(session.actor, {
    verb: "member.invited",
    subjectType: "user",
    subjectId: created.userId,
    metadata: { email: data.email, role: data.role },
  });

  // Written to the outbox whatever happens next. On this deployment nothing
  // is delivered -- there is no mail server on a local network -- but the
  // message exists in full and an admin can read it, link included, from the
  // outbox under Settings. That is what the invite dialog now says.
  const message = await inviteMessage({
    toEmail: data.email,
    toName: data.name,
    // The recipient's language, which is not necessarily the inviter's: the
    // organization default is the best guess available before they have ever
    // signed in and set one.
    locale: (await getLocale()) === "fr" ? "fr" : "en",
    organizationName: session.organization.name,
    invitedByName: session.user.name,
    token: created.token,
  });

  await queue(session.actor, message);

  // Not awaited: an invite form should not sit on an SMTP timeout. On the
  // default driver this returns immediately having attempted nothing.
  void flush(session.actor).catch(() => {});

  const locale = await getLocale();
  revalidatePath(`/${locale}/people`);
  return { ok: true };
}

const roleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["owner", "admin", "manager", "member"]),
  permissions: z.object({
    finance: z.boolean().optional(),
    people: z.boolean().optional(),
    crm: z.boolean().optional(),
    insights: z.boolean().optional(),
  }),
});

/**
 * Change someone's role and module access.
 *
 * Two rules beyond the permission check, both of them about not locking the
 * organization out of itself: only an owner may create or remove an owner, and
 * the last owner cannot be demoted.
 */
export async function updateMemberRole(
  userId: string,
  role: "owner" | "admin" | "manager" | "member",
  permissions: ModulePermissions,
): Promise<PeopleResult> {
  const session = await requirePermissionForAction("member.editRole");
  const parsed = roleSchema.safeParse({ userId, role, permissions });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const scope = withOrg(session.actor.organizationId);

  const [target] = await scope.selectFields(
    memberships,
    { id: memberships.id, role: memberships.role, userId: memberships.userId },
    eq(memberships.userId, parsed.data.userId),
  );
  if (!target) return { ok: false, error: "notFound" };

  const touchesOwner = target.role === "owner" || parsed.data.role === "owner";
  if (touchesOwner && session.actor.role !== "owner") {
    return { ok: false, error: "onlyOwnerCanEditOwner" };
  }

  if (target.role === "owner" && parsed.data.role !== "owner") {
    const owners = await scope.selectFields(
      memberships,
      { id: memberships.id },
      eq(memberships.role, "owner"),
    );
    if (owners.length <= 1) return { ok: false, error: "lastOwner" };
  }

  await scope.update(
    memberships,
    { role: parsed.data.role, permissions: parsed.data.permissions, updatedAt: new Date() },
    eq(memberships.userId, parsed.data.userId),
  );

  await recordActivity(session.actor, {
    verb: "member.roleChanged",
    subjectType: "user",
    subjectId: parsed.data.userId,
    metadata: { from: target.role, to: parsed.data.role, permissions: parsed.data.permissions },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/people`);
  revalidatePath(`/${locale}/people/${parsed.data.userId}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Acting on somebody else's account                                           */
/* -------------------------------------------------------------------------- */

/**
 * Whoever is being acted on, with the two facts every guard below needs.
 * Scoped by `withOrg`, so a user id from another tenant simply is not found.
 */
async function findTarget(organizationId: string, userId: string) {
  const [row] = await withOrg(organizationId).selectFields(
    memberships,
    { role: memberships.role, status: memberships.status, userId: memberships.userId },
    eq(memberships.userId, userId),
  );
  return row ?? null;
}

/**
 * Exactly the rule `updateMemberRole` applies: an owner is an owner's business.
 * The rule itself lives in `lib/member-guards.ts`, where it can be tested
 * without a database -- see that file's own note.
 */
const ownerGuard = mayActOnTarget;

/**
 * `requireRecentAuth()` as a result rather than a throw.
 *
 * The guard signals a lapsed re-auth window by throwing, which is right for a
 * page -- the error boundary catches it. From a Server Action it has to come
 * back as data instead: a rejected promise reaches the client as an opaque
 * "server error", and the caller needs to tell "prove your password" apart
 * from "something broke" in order to show the prompt. Same shape
 * `revokeDevice` already uses in `lib/auth/actions.ts`; only the error-string
 * wrapper differs.
 */
async function recentAuthOrRefuse(): Promise<{ ok: false; error: string } | null> {
  try {
    await requireRecentAuth();
    return null;
  } catch (error) {
    if (error instanceof ReauthRequiredError) return { ok: false, error: "reauthRequired" };
    throw error;
  }
}

const memberProfileSchema = z.object({
  userId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).optional(),
});

/**
 * Fix somebody's name or job title.
 *
 * The admin-side twin of `updateProfile`, which only ever reaches the caller's
 * own row. Routine, so it does not ask for a password -- correcting a typo in a
 * directory is not the kind of act re-auth exists for, and prompting on
 * ordinary saves is what taught people at the old app to type their password
 * without reading the dialog.
 */
export async function updateMemberProfile(
  input: z.input<typeof memberProfileSchema>,
): Promise<PeopleResult> {
  const session = await requirePermissionForAction("member.editProfile");
  const parsed = memberProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const target = await findTarget(session.actor.organizationId, parsed.data.userId);
  if (!target) return { ok: false, error: "notFound" };
  if (!ownerGuard(target.role, session.actor.role)) {
    return { ok: false, error: "onlyOwnerCanEditOwner" };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ name: parsed.data.name, updatedAt: new Date() })
      .where(eq(users.id, parsed.data.userId));

    await withOrg(session.actor.organizationId, tx).update(
      memberships,
      { jobTitle: parsed.data.jobTitle || null, updatedAt: new Date() },
      eq(memberships.userId, parsed.data.userId),
    );
  });

  await recordActivity(session.actor, {
    verb: "member.profileEdited",
    subjectType: "user",
    subjectId: parsed.data.userId,
    metadata: { name: parsed.data.name },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/people`);
  revalidatePath(`/${locale}/people/${parsed.data.userId}`);
  return { ok: true };
}

const memberEmailSchema = z.object({
  userId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

/**
 * Change the address somebody signs in with.
 *
 * The most dangerous write in this file, and the reason it is fenced the way it
 * is: email is both the credential and where a password reset is delivered, so
 * whoever can rewrite it can take the account. Four things stand in the way --
 *
 * 1. `requireRecentAuth()`, so a borrowed session is not enough; the admin has
 *    to prove the password again. This is the "destructive or sensitive"
 *    exception CLAUDE.md reserves re-auth for.
 * 2. An owner's address can only be changed by an owner.
 * 3. Every session the target holds is revoked. Their identity just moved and
 *    their tokens should not outlive it.
 * 4. It is recorded, and the person it happened to is notified in the app --
 *    see `recipientsFor`. A change nobody can see afterwards is the whole
 *    attack.
 *
 * There is deliberately no confirmation link sent to the new address. That
 * would be the stronger design, and it is written up in `KNOWN-GAPS.md`: this
 * deployment sends no mail at all yet, so a link would confirm nothing.
 */
export async function changeMemberEmail(
  input: z.input<typeof memberEmailSchema>,
): Promise<PeopleResult> {
  const session = await requirePermissionForAction("member.changeEmail");
  const lapsed = await recentAuthOrRefuse();
  if (lapsed) return lapsed;

  const parsed = memberEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", fieldErrors: { email: "invalid" } };

  const target = await findTarget(session.actor.organizationId, parsed.data.userId);
  if (!target) return { ok: false, error: "notFound" };
  if (!ownerGuard(target.role, session.actor.role)) {
    return { ok: false, error: "onlyOwnerCanEditOwner" };
  }

  const [current] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, parsed.data.userId));
  if (!current) return { ok: false, error: "notFound" };
  if (current.email === parsed.data.email) return { ok: true };

  // Checked up front so the answer names the field, rather than surfacing as a
  // unique-constraint violation. `users.email` is global, not per-tenant, so
  // this looks across every organization.
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email));
  if (taken) return { ok: false, error: "emailTaken", fieldErrors: { email: "emailTaken" } };

  await db
    .update(users)
    .set({ email: parsed.data.email, updatedAt: new Date() })
    .where(eq(users.id, parsed.data.userId));

  await revokeAllSessions(parsed.data.userId);

  await recordActivity(session.actor, {
    verb: "member.emailChanged",
    subjectType: "user",
    subjectId: parsed.data.userId,
    metadata: { from: current.email, to: parsed.data.email },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/people`);
  revalidatePath(`/${locale}/people/${parsed.data.userId}`);
  return { ok: true };
}

const suspendSchema = z.object({ userId: z.uuid(), suspended: z.boolean() });

/**
 * Take somebody's access away, or give it back.
 *
 * Suspension rather than deletion: they have written tasks, comments and
 * activity, and an account that authored half a project's history cannot be
 * removed without either destroying that history or orphaning it.
 *
 * Nothing in the auth path needed changing for this to bite.
 * `findMembershipsForUser` already filters `status = 'active'`, and a session
 * with no membership resolves to nothing -- so a suspended person is refused on
 * their very next request. Their sessions are revoked as well, so it is
 * immediate rather than merely inevitable.
 */
export async function setMemberSuspended(
  input: z.input<typeof suspendSchema>,
): Promise<PeopleResult> {
  const session = await requirePermissionForAction("member.suspend");
  const lapsed = await recentAuthOrRefuse();
  if (lapsed) return lapsed;

  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const target = await findTarget(session.actor.organizationId, parsed.data.userId);
  if (!target) return { ok: false, error: "notFound" };

  const scope = withOrg(session.actor.organizationId);

  // Counted only when the answer could possibly be "last owner": every other
  // refusal is decided from the two roles alone, and this is a table scan.
  const ownerCount =
    parsed.data.suspended && target.role === "owner"
      ? (
          await scope.selectFields(
            memberships,
            { id: memberships.id },
            eq(memberships.role, "owner"),
          )
        ).length
      : Number.POSITIVE_INFINITY;

  const refusal = guardSuspend({
    actorUserId: session.actor.userId,
    actorRole: session.actor.role,
    targetUserId: parsed.data.userId,
    targetRole: target.role,
    suspended: parsed.data.suspended,
    ownerCount,
  });
  if (refusal) return { ok: false, error: refusal };

  await scope.update(
    memberships,
    { status: parsed.data.suspended ? "suspended" : "active", updatedAt: new Date() },
    eq(memberships.userId, parsed.data.userId),
  );

  if (parsed.data.suspended) await revokeAllSessions(parsed.data.userId);

  await recordActivity(session.actor, {
    verb: parsed.data.suspended ? "member.suspended" : "member.reinstated",
    subjectType: "user",
    subjectId: parsed.data.userId,
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/people`);
  revalidatePath(`/${locale}/people/${parsed.data.userId}`);
  return { ok: true };
}

/** Like `PeopleResult`, but the success case carries the one thing to show. */
export type ResetPasswordResult =
  /**
   * `activated` is true when this also turned a never-accepted invitation into
   * a working membership -- the UI says so, because it is the difference
   * between "they can sign in now" and "they already could".
   */
  | { ok: true; password: string; activated: boolean }
  | { ok: false; error: string };

const resetPasswordSchema = z.object({ userId: z.uuid() });

/**
 * Set somebody a new password and hand it back once, for the admin to pass on.
 *
 * The answer to the actual question people ask -- "I have lost my password" --
 * put to an admin outside the app, by phone or in person. The alternative
 * already here, `sendPasswordReset`, mints a link instead; that is the better
 * shape in general and is kept, but it means hunting through the Outbox for a
 * URL and then getting that URL to somebody who, by definition, is having
 * trouble getting in. This is the direct version.
 *
 * **It grants an admin no power they did not already hold.** The reset link
 * `sendPasswordReset` writes lands in the Outbox, which every admin can read
 * in full -- so an admin could already spend one and take any non-owner
 * account. If anything this is the tighter of the two: the password is
 * returned to the one caller who asked for it and is never written down, where
 * a link sits in `messages` indefinitely (see `KNOWN-GAPS.md` on outbox
 * retention).
 *
 * Fenced the same way the other sensitive acts in this file are:
 *
 * 1. `requireRecentAuth()`, so a borrowed session is not enough.
 * 2. An owner's password can only be reset by an owner.
 * 3. Never yourself -- Settings already changes your own password, and it asks
 *    for the current one, which is the right question there and impossible
 *    here.
 * 4. Every session the target holds is revoked, and `passwordChangedAt` moves,
 *    which refuses anything issued earlier even if a revocation were missed.
 * 5. Recorded, and the person is told in the app.
 *
 * The password itself is deliberately absent from the activity row, the
 * notification and every log: the only copy is the one returned here, and once
 * the caller's screen is gone it cannot be recovered -- only replaced.
 *
 * There is no forced change at next sign-in -- asked for and declined, to keep
 * a schema migration out of it. The consequence, which the UI says in as many
 * words: whoever ran this knows a working password until its owner replaces
 * it. `KNOWN-GAPS.md` carries it.
 */
export async function resetMemberPassword(
  input: z.input<typeof resetPasswordSchema>,
): Promise<ResetPasswordResult> {
  const session = await requirePermissionForAction("member.resetPassword");
  const lapsed = await recentAuthOrRefuse();
  if (lapsed) return { ok: false, error: lapsed.error };

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  if (parsed.data.userId === session.actor.userId) {
    return { ok: false, error: "cannotResetSelf" };
  }

  const target = await findTarget(session.actor.organizationId, parsed.data.userId);
  if (!target) return { ok: false, error: "notFound" };
  if (!ownerGuard(target.role, session.actor.role)) {
    return { ok: false, error: "onlyOwnerCanEditOwner" };
  }

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  const now = new Date();

  /*
    Somebody who was invited and never accepted has no active membership, and
    without one a password is useless to them: sign-in now refuses outright,
    and before it did something worse -- it let them in and the next request
    threw them out with "your session ended". So setting a password for a
    pending member activates them too.

    This is exactly the pair of writes spending an invite token already makes
    (`spendToken`, for `purpose === "invite"`): set the password, mark the
    membership active. The two paths now agree, and it grants an admin nothing
    -- the invite link sitting in the Outbox they can already read activates
    that person in precisely the same way.

    A suspended membership is deliberately *not* touched. Suspension is a
    decision somebody made; quietly undoing it as a side effect of a password
    reset would be the surprising behaviour. Reinstating is its own control.
  */
  const activating = target.status === "invited";

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        // Refuses every session created before now, the same way spending a
        // reset token does -- belt as well as the braces below.
        passwordChangedAt: now,
        // Somebody else chose this one. They are made to replace it before
        // they can reach anything, which is what stops the copy read out here
        // from working forever.
        mustChangePassword: true,
        updatedAt: now,
      })
      .where(eq(users.id, parsed.data.userId));

    if (activating) {
      await withOrg(session.actor.organizationId, tx).update(
        memberships,
        { status: "active", joinedAt: now, updatedAt: now },
        eq(memberships.userId, parsed.data.userId),
      );

      // Their outstanding invitation is retired in the same breath. Leaving it
      // live would mean a link in the Outbox could still set a third password
      // weeks later, silently replacing the one just handed over.
      await tx
        .update(authTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(authTokens.userId, parsed.data.userId),
            eq(authTokens.purpose, "invite"),
            isNull(authTokens.usedAt),
          ),
        );
    }
  });

  await revokeAllSessions(parsed.data.userId);

  await recordActivity(session.actor, {
    verb: "member.passwordReset",
    subjectType: "user",
    subjectId: parsed.data.userId,
    // No metadata on purpose. An activity row is readable by more people than
    // the one who ran this, and forever.
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/people`);
  revalidatePath(`/${locale}/people/${parsed.data.userId}`);
  return { ok: true, password, activated: activating };
}

const departmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional(),
});

/**
 * A department slug, unique within the org.
 *
 * Checked against every row regardless of `archivedAt`: the unique index is
 * on `(organizationId, slug)` alone, so an archived department's slug is
 * still taken as far as Postgres is concerned, and a collision here should
 * read as "already used" rather than surface as a constraint violation.
 */
async function uniqueDepartmentSlug(organizationId: string, name: string): Promise<string> {
  const base = slugify(name, "department");
  const existing = await withOrg(organizationId).selectFields(departments, {
    slug: departments.slug,
  });
  const taken = new Set(existing.map((row) => row.slug));

  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a free department slug for "${name}"`);
}

/**
 * Add a department.
 *
 * Behind `organization.editSettings` -- structural, org-wide, the same
 * question as who may switch the org's own name or timezone -- rather than
 * `member.invite`, which is about one person at a time and is open to
 * managers as well as admins.
 */
export async function createDepartment(formData: FormData): Promise<PeopleResult> {
  const session = await requirePermissionForAction("organization.editSettings");

  const parsed = departmentSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field) fieldErrors[field] = "invalid";
    }
    return { ok: false, error: "invalid", fieldErrors };
  }

  const slug = await uniqueDepartmentSlug(session.actor.organizationId, parsed.data.name);

  const [created] = await withOrg(session.actor.organizationId).insert(departments, {
    slug,
    name: parsed.data.name,
    description: parsed.data.description || null,
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "department.created",
    subjectType: "department",
    subjectId: created.id,
    metadata: { name: parsed.data.name },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/people`);
  revalidatePath(`/${locale}/settings`);
  return { ok: true };
}

const updateDepartmentSchema = departmentSchema.extend({ id: z.uuid() });

/**
 * Rename a department, or change its description.
 *
 * Same gate as creating one -- this is the org's own shape, not a per-person
 * decision. The slug is left alone on purpose: nothing in the app reads one
 * from a URL or a link, so there is no reason for it to move once a name
 * changes, and moving it anyway would be inventing a problem to go with the
 * fix.
 */
export async function updateDepartment(formData: FormData): Promise<PeopleResult> {
  const session = await requirePermissionForAction("organization.editSettings");

  const parsed = updateDepartmentSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field) fieldErrors[field] = "invalid";
    }
    return { ok: false, error: "invalid", fieldErrors };
  }

  const [updated] = await withOrg(session.actor.organizationId).update(
    departments,
    { name: parsed.data.name, description: parsed.data.description || null },
    eq(departments.id, parsed.data.id),
  );
  if (!updated) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "department.renamed",
    subjectType: "department",
    subjectId: updated.id,
    metadata: { name: parsed.data.name },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/people`);
  revalidatePath(`/${locale}/settings`);
  return { ok: true };
}
