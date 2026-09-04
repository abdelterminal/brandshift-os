"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";

/**
 * "I have seen it."
 *
 * Called when somebody finishes the tour and when they skip it, because those
 * are the same answer to the only question being asked: should this appear
 * again? Skipping is not a state to be nagged out of.
 *
 * Written against the session's own user id, never one from the form, so this
 * cannot mark anybody else as onboarded.
 */
export async function completeTour(): Promise<{ ok: true }> {
  const session = await requireUser();

  await db
    .update(users)
    .set({ tourCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, session.actor.userId));

  // Deliberately no `revalidatePath`. The shell decides whether to render the
  // tour, and re-rendering it mid-dismissal would tear the card out from under
  // the person closing it. The next navigation picks up the new row.
  return { ok: true };
}
