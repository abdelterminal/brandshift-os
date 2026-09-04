"use server";

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { withOrg } from "@/db/tenancy";
import { requireUser } from "@/lib/auth/guards";

/**
 * Your own details.
 *
 * The division here is the whole of it: you may change what you are *called*
 * and what language the app speaks to you in. You may not change your role,
 * your permissions, your department or your leave allowance -- those are terms
 * of employment, and a person who can grant themselves the `finance` flag is
 * not a permission system.
 *
 * Job title sits on the editable side, which is a judgement rather than an
 * obvious call: it is a label on a directory card in an agency of a dozen
 * people, not an authority. `member.editRole` still owns everything that
 * actually decides what you can do.
 */

export type ProfileResult = { ok: true } | { ok: false; error: string };

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().max(120).optional(),
  /** Empty means "follow the organization's default" rather than a language. */
  locale: z.union([z.enum(["en", "fr"]), z.literal("")]).optional(),
});

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ProfileResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  // `requireUser`, not a permission: everybody may edit their own profile, and
  // nobody reaches anybody else's through this action -- the ids come from the
  // session rather than from the form, which is what makes that true.
  const session = await requireUser();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        name: parsed.data.name,
        locale: parsed.data.locale ? parsed.data.locale : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.actor.userId));

    await withOrg(session.actor.organizationId, tx).update(
      memberships,
      { jobTitle: parsed.data.jobTitle || null, updatedAt: new Date() },
      eq(memberships.userId, session.actor.userId),
    );
  });

  // The whole layout: the avatar menu, the rail and the greeting all read the
  // name, and a locale change moves which messages are loaded.
  revalidatePath(`/${await getLocale()}`, "layout");
  return { ok: true };
}
