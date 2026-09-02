"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUserForAction } from "@/lib/auth/guards";
import { markAllRead, markRead } from "@/lib/data/notifications";

/**
 * Reading your inbox.
 *
 * Both actions are scoped to the signed-in person inside the data layer, so
 * passing somebody else's notification id marks nothing.
 */

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false };

  const session = await requireUserForAction();
  await markRead(session.actor, parsed.data);

  // The unread badge lives on the rail, which the layout renders, so the whole
  // segment has to be revalidated rather than just the page.
  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const session = await requireUserForAction();
  await markAllRead(session.actor);

  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
  return { ok: true };
}
