"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSession } from "@/lib/auth/session";
import { spendToken, type TokenPurpose } from "@/lib/auth/tokens";

/**
 * Accepting an invitation, or finishing a reset.
 *
 * The same action for both, because they are the same act: prove you hold a
 * one-time link, then choose a password. The only difference is what the token
 * says it is for, and that is checked against the link rather than trusted from
 * the form -- otherwise an expired reset could be spent as an invitation.
 *
 * On success it signs the person straight in. Making somebody who has just
 * chosen a password type it again on the next screen is a rite of passage, not
 * a security measure: they demonstrably know it, and they proved they hold the
 * address a moment ago.
 */

export type AcceptResult = { ok: false; error: string };

const schema = z.object({
  token: z.string().min(20).max(200),
  purpose: z.enum(["invite", "reset"]),
  // Ten, not eight. The only password rule in this app, and it is a length
  // rather than a character-class puzzle -- those produce `Passw0rd!` and a
  // sticky note.
  password: z.string().min(10).max(200),
});

export async function setPassword(input: z.input<typeof schema>): Promise<AcceptResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "tooShort" };

  const spent = await spendToken(
    parsed.data.token,
    parsed.data.purpose as TokenPurpose,
    parsed.data.password,
  );

  if (!spent.ok) return { ok: false, error: spent.reason };

  // No organization argument: the membership the invite activated is the only
  // one they have, and `createSession` resolves it.
  await createSession(spent.userId, null);

  const locale = await getLocale();
  redirect(`/${locale}/today`);
}
