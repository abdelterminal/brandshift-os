"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import {
  deleteMessage,
  editMessage,
  joinChannel,
  leaveChannel,
  markChannelRead,
  postMessage,
} from "@/lib/data/channels";
import { publishChannelChange } from "@/lib/realtime/channel-events";

/**
 * Channel mutations.
 *
 * Talking is a routine write, so none of these asks for a password. Every one
 * of them is scoped to the signed-in person inside the data layer -- editing
 * and deleting filter on `author_user_id` there, so passing somebody else's
 * message id changes nothing rather than being refused after the fact.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

/**
 * What a message may be.
 *
 * Trimmed before it is measured, so a box full of spaces is empty rather than
 * a message nobody can see. The ceiling is generous but finite: a channel is
 * for talking, and a document pasted into it is a document that should have
 * been a document.
 */
const bodySchema = z.string().trim().min(1).max(4000);

/**
 * The unread badge lives on the rail, which the layout renders, so posting has
 * to revalidate the whole segment rather than just the page.
 */
async function revalidateChannelViews() {
  const locale = await getLocale();
  revalidatePath(`/${locale}`, "layout");
}

export async function sendMessage(channelId: string, body: string): Promise<ActionResult> {
  const id = idSchema.safeParse(channelId);
  const text = bodySchema.safeParse(body);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!text.success) return { ok: false, error: "empty" };

  const session = await requirePermissionForAction("channel.post");

  // Sending into a channel you are not in is how you end up in it. It is the
  // same rule as opening one, and it keeps the read mark honest.
  await joinChannel(session.actor, id.data);

  const created = await postMessage(session.actor, id.data, text.data);
  if (!created) return { ok: false, error: "notFound" };

  await publishChannelChange(session.actor.organizationId, id.data);
  await revalidateChannelViews();
  return { ok: true };
}

export async function updateMessage(messageId: string, body: string): Promise<ActionResult> {
  const id = idSchema.safeParse(messageId);
  const text = bodySchema.safeParse(body);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!text.success) return { ok: false, error: "empty" };

  const session = await requirePermissionForAction("channel.post");
  const edited = await editMessage(session.actor, id.data, text.data);
  if (!edited) return { ok: false, error: "notFound" };

  await revalidateChannelViews();
  return { ok: true };
}

export async function removeMessage(messageId: string): Promise<ActionResult> {
  const id = idSchema.safeParse(messageId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("channel.post");
  const removed = await deleteMessage(session.actor, id.data);
  if (!removed) return { ok: false, error: "notFound" };

  await revalidateChannelViews();
  return { ok: true };
}

/**
 * Move the read mark.
 *
 * Called when the channel is open and its newest message is on screen, not on
 * arrival: a channel you opened and scrolled away from without reaching the
 * bottom has not been read, and marking it read would lose the thing you were
 * about to come back to.
 */
export async function readChannel(channelId: string): Promise<ActionResult> {
  const id = idSchema.safeParse(channelId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("channel.view");
  await markChannelRead(session.actor, id.data);

  await revalidateChannelViews();
  return { ok: true };
}

export async function joinChannelAction(channelId: string): Promise<ActionResult> {
  const id = idSchema.safeParse(channelId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("channel.view");
  await joinChannel(session.actor, id.data);

  await revalidateChannelViews();
  return { ok: true };
}

/** Leaving takes it off your rail. Nothing is deleted and you can come back. */
export async function leaveChannelAction(channelId: string): Promise<ActionResult> {
  const id = idSchema.safeParse(channelId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("channel.view");
  await leaveChannel(session.actor, id.data);

  await revalidateChannelViews();
  return { ok: true };
}
