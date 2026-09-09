"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermissionForAction, requireUserForAction } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { recordActivity } from "@/lib/data/activity";
import {
  approveJoinRequest,
  declineJoinRequest,
  deleteMessage,
  editMessage,
  getChannelById,
  isActiveChannelMember,
  leaveChannel,
  markChannelRead,
  postMessage,
  requestToJoinChannel,
  setChannelPinned,
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

  // Posting used to be a second, quieter way in -- say something and you're
  // joined. That door closes with the first one: only an active member may
  // post, and asking is `requestToJoinChannelAction`, not a side effect of
  // typing.
  if (!(await isActiveChannelMember(session.actor, id.data))) {
    return { ok: false, error: "notMember" };
  }

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

/** Ask to get into a channel you're not on. Somebody with the standing to answer has to. */
export async function requestToJoinChannelAction(channelId: string): Promise<ActionResult> {
  const id = idSchema.safeParse(channelId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("channel.view");
  const channel = await getChannelById(session.actor, id.data);
  if (!channel) return { ok: false, error: "notFound" };

  await requestToJoinChannel(session.actor, id.data);

  await recordActivity(session.actor, {
    verb: "channel.joinRequested",
    subjectType: "channel",
    subjectId: id.data,
    metadata: { title: channel.name },
  });

  await revalidateChannelViews();
  return { ok: true };
}

/**
 * Answer a request. `can("channel.manageMembers")` here, not in `authz.ts`
 * alone -- it needs the channel's own `createdByUserId` as the resource, the
 * same shape `meeting.manage` already takes for "the organizer, or an admin".
 */
async function requireChannelManager(channelId: string) {
  const session = await requireUserForAction();
  const channel = await getChannelById(session.actor, channelId);
  if (!channel) return { session, channel: null, allowed: false };

  const allowed = can(session.actor, "channel.manageMembers", {
    ownerUserId: channel.createdByUserId,
  });
  return { session, channel, allowed };
}

export async function approveJoinRequestAction(
  channelId: string,
  userId: string,
): Promise<ActionResult> {
  const id = idSchema.safeParse(channelId);
  const requester = idSchema.safeParse(userId);
  if (!id.success || !requester.success) return { ok: false, error: "notFound" };

  const { session, channel, allowed } = await requireChannelManager(id.data);
  if (!channel) return { ok: false, error: "notFound" };
  if (!allowed) return { ok: false, error: "forbidden" };

  const approved = await approveJoinRequest(session.actor, id.data, requester.data);
  if (!approved) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "channel.joinApproved",
    subjectType: "channel",
    subjectId: id.data,
    metadata: { title: channel.name, requesterUserId: requester.data },
  });

  await revalidateChannelViews();
  return { ok: true };
}

export async function declineJoinRequestAction(
  channelId: string,
  userId: string,
): Promise<ActionResult> {
  const id = idSchema.safeParse(channelId);
  const requester = idSchema.safeParse(userId);
  if (!id.success || !requester.success) return { ok: false, error: "notFound" };

  const { session, channel, allowed } = await requireChannelManager(id.data);
  if (!channel) return { ok: false, error: "notFound" };
  if (!allowed) return { ok: false, error: "forbidden" };

  const declined = await declineJoinRequest(session.actor, id.data, requester.data);
  if (!declined) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "channel.joinDeclined",
    subjectType: "channel",
    subjectId: id.data,
    metadata: { title: channel.name, requesterUserId: requester.data },
  });

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

/**
 * Pin or unpin a channel on your own rail.
 *
 * Whether you may pin at all is the same question as whether you may see
 * channels -- there is no separate permission for arranging your own rail.
 */
export async function setChannelPinnedAction(
  channelId: string,
  pinned: boolean,
): Promise<ActionResult> {
  const id = idSchema.safeParse(channelId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("channel.view");
  await setChannelPinned(session.actor, id.data, pinned);

  await revalidateChannelViews();
  return { ok: true };
}
