"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { flush } from "@/lib/mail/transport";

/**
 * Try the queue again by hand.
 *
 * There is no scheduler on this deployment, so the only two things that ever
 * move a message are queueing one and pressing this. That is a gap rather than
 * a design -- recorded in KNOWN-GAPS -- and it is honest: a retry button
 * somebody has to press is visibly manual, where a queue that silently never
 * drains looks like it is working.
 *
 * Behind `member.invite`, the same permission as the outbox screen: the bodies
 * carry links that set passwords.
 */
export async function retryOutbox(): Promise<{ sent: number; failed: number }> {
  const session = await requirePermissionForAction("member.invite");

  const result = await flush(session.actor);

  revalidatePath(`/${await getLocale()}/settings`);
  return result;
}
