"use server";

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { departments, memberships, users, type ModulePermissions } from "@/db/schema/people";
import { withOrg } from "@/db/tenancy";
import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import { createToken } from "@/lib/auth/tokens";
import { inviteMessage } from "@/lib/mail/templates";
import { flush, queue } from "@/lib/mail/transport";
import { hashPassword } from "@/lib/password";
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
