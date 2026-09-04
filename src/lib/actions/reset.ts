"use server";

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createToken } from "@/lib/auth/tokens";
import { findMembershipsForUser } from "@/db/tenancy";
import { resetMessage } from "@/lib/mail/templates";
import { flush, queue } from "@/lib/mail/transport";

/**
 * Asking for a password reset.
 *
 * The only unauthenticated action in the app that writes anything, which makes
 * it the one with the most ways to be misused. Three rules, all of them about
 * that:
 *
 * 1. **It always answers the same way.** Whether the address is a member, a
 *    stranger, or nonsense, the screen says the same sentence. Sign-in already
 *    resists enumeration this way -- one message for both halves and a dummy
 *    hash verified when no user matches -- and a reset form that says "no such
 *    account" would hand back everything sign-in refuses to give.
 * 2. **One live token per person.** Asking twice does not queue two messages;
 *    the second replaces the first. Otherwise anybody could fill somebody's
 *    inbox, or the outbox, by holding down a button.
 * 3. **It costs the same either way.** The work is a database read and, at
 *    most, one insert. No timing difference worth measuring, and nothing that
 *    would make a slow response mean "that address exists".
 *
 * There is still no rate limiting -- the existing gap, unchanged: this is a LAN
 * deployment and sign-in has the same hole. Point 2 is what stops the obvious
 * abuse in the meantime.
 */

export type ResetResult = { ok: true };

const schema = z.object({
  email: z.string().trim().toLowerCase().max(320),
});

/** Minutes between requests for the same person. */
const COOLDOWN_SECONDS = 5 * 60;

export async function requestReset(input: z.input<typeof schema>): Promise<ResetResult> {
  const parsed = schema.safeParse(input);

  // Even a malformed address gets the same answer. Telling somebody their
  // typo was rejected is a small thing; telling them which typos are rejected
  // is a probe.
  if (!parsed.success) return { ok: true };

  const [person] = await db
    .select({ id: users.id, name: users.name, email: users.email, locale: users.locale })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (!person) return { ok: true };

  // Which organization to write the token and the message against. Somebody
  // with no membership at all has nothing to reset into, and is answered the
  // same way as a stranger.
  const memberships = await findMembershipsForUser(person.id);
  const membership = memberships[0];
  if (!membership) return { ok: true };

  const actor = {
    userId: person.id,
    organizationId: membership.organizationId,
    role: membership.role,
    permissions: membership.permissions,
  };

  const recent = await recentResetFor(person.id);
  if (recent) return { ok: true };

  const token = await createToken(membership.organizationId, person.id, "reset");

  const message = await resetMessage({
    toEmail: person.email,
    toName: person.name,
    locale: person.locale ?? ((await getLocale()) === "fr" ? "fr" : "en"),
    organizationName: membership.organizationName,
    token,
  });

  await queue(actor, message);
  void flush(actor).catch(() => {});

  return { ok: true };
}

/**
 * Whether this person asked recently.
 *
 * Kept next to the action rather than in `tokens.ts` because it is a policy
 * about how often somebody may ask, not a fact about what a token is.
 */
async function recentResetFor(userId: string): Promise<boolean> {
  const { authTokens } = await import("@/db/schema");
  const { and, gt, isNull } = await import("drizzle-orm");

  const rows = await db
    .select({ id: authTokens.id })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, "reset"),
        isNull(authTokens.usedAt),
        gt(authTokens.createdAt, new Date(Date.now() - COOLDOWN_SECONDS * 1000)),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
