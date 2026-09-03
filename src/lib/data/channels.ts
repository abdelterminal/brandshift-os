import "server-only";

import { and, eq, isNull, ne, sql, type SQL } from "drizzle-orm";

import { channelMembers, channels, messages } from "@/db/schema/channels";
import { users } from "@/db/schema/people";
import { projectMembers, projects } from "@/db/schema/projects";
import { withOrg, type Executor } from "@/db/tenancy";
import { slugify } from "@/lib/slug";

import type { Actor } from "../authz";
import { listProjectActivity, type ActivityRow } from "./activity";

/**
 * Channels.
 *
 * Two ideas hold this together.
 *
 * The first is that a project channel is not a chat room bolted onto a
 * project -- it is the project's own history with people talking in it. The
 * feed interleaves `activity_events` and `messages` in one column, in the
 * order they happened, because "Elena completed a task" and "Elena: can we
 * push the deadline?" are the same conversation.
 *
 * The second is that a message does not reach the inbox. Unread state is the
 * channel's own signal, carried by a badge on the rail; the inbox stays for
 * the handful of things that need one specific person -- work you were given,
 * a blocker on something you run. A chat app that copies every message into a
 * notification list produces two queues saying the same thing, and people stop
 * reading both. Mentions will change this, and will be the reason to.
 */

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type ChannelRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: "project" | "deal" | "general";
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
};

export type ChannelListRow = ChannelRow & {
  /** Unread messages from other people. Your own are never unread. */
  unread: number;
  /** Null while you have never opened it. */
  lastReadAt: Date | null;
  /** Whether you are in it, which is what puts it on your rail. */
  joined: boolean;
};

const CHANNEL_FIELDS = {
  id: channels.id,
  slug: channels.slug,
  name: channels.name,
  description: channels.description,
  kind: channels.kind,
  projectId: channels.projectId,
  projectKey: projects.key,
  projectName: projects.name,
};

/** Left: a general channel belongs to no project. */
const PROJECT_JOIN = [
  {
    table: projects,
    on: eq(projects.id, channels.projectId),
    type: "left" as const,
  },
];

/**
 * How many messages each channel holds that this person has not read.
 *
 * One `group by`, joined to their own membership row so each channel is
 * compared against its own read mark. Counting per channel would be a query
 * per row on the rail, and tallying in memory would mean reading every message
 * in the organization to render a badge.
 */
async function unreadByChannel(actor: Actor): Promise<Map<string, number>> {
  return withOrg(actor.organizationId).groupCount(
    messages,
    messages.channelId,
    [
      {
        table: channelMembers,
        on: and(
          eq(channelMembers.channelId, messages.channelId),
          eq(channelMembers.userId, actor.userId),
        ) as SQL,
        type: "inner" as const,
      },
    ],
    // A channel you have never opened counts everything, which is the same
    // rule written once rather than a null check bolted on beside it.
    sql`${messages.createdAt} > coalesce(${channelMembers.lastReadAt}, to_timestamp(0))`,
    ne(messages.authorUserId, actor.userId),
    isNull(messages.deletedAt),
  );
}

/** Every channel in the organization, with this person's unread state. */
export async function listChannels(actor: Actor): Promise<ChannelListRow[]> {
  const scope = withOrg(actor.organizationId);

  const [rows, memberships, unread] = await Promise.all([
    scope.selectJoined(
      channels,
      CHANNEL_FIELDS,
      PROJECT_JOIN,
      isNull(channels.archivedAt),
    ) as Promise<ChannelRow[]>,
    scope.selectFields(
      channelMembers,
      {
        channelId: channelMembers.channelId,
        lastReadAt: channelMembers.lastReadAt,
      },
      eq(channelMembers.userId, actor.userId),
    ),
    unreadByChannel(actor),
  ]);

  const mine = new Map(memberships.map((row) => [row.channelId, row.lastReadAt]));

  return rows
    .map((row) => ({
      ...row,
      unread: unread.get(row.id) ?? 0,
      lastReadAt: mine.get(row.id) ?? null,
      joined: mine.has(row.id),
    }))
    .sort(
      (a, b) =>
        Number(b.joined) - Number(a.joined) || b.unread - a.unread || a.name.localeCompare(b.name),
    );
}

/** The channels on this person's rail: the ones they are actually in. */
export async function listJoinedChannels(actor: Actor): Promise<ChannelListRow[]> {
  return (await listChannels(actor)).filter((row) => row.joined);
}

/** Looked up by slug, so `/channels/meridian` is a URL someone can read. */
export async function getChannelBySlug(actor: Actor, slug: string): Promise<ChannelRow | null> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    channels,
    CHANNEL_FIELDS,
    PROJECT_JOIN,
    eq(channels.slug, slug.toLowerCase()),
  )) as ChannelRow[];

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

export type MessageEntry = {
  kind: "message";
  id: string;
  at: Date;
  authorUserId: string;
  authorName: string | null;
  avatarUrl: string | null;
  body: string;
  editedAt: Date | null;
  deletedAt: Date | null;
};

export type EventEntry = {
  kind: "event";
  id: string;
  at: Date;
  verb: string;
  actorName: string | null;
  metadata: Record<string, unknown>;
  taskId: string | null;
};

export type FeedEntry = MessageEntry | EventEntry;

const MESSAGE_FIELDS = {
  id: messages.id,
  at: messages.createdAt,
  authorUserId: messages.authorUserId,
  authorName: users.name,
  avatarUrl: users.avatarUrl,
  body: messages.body,
  editedAt: messages.editedAt,
  deletedAt: messages.deletedAt,
};

/**
 * One channel's feed, oldest first.
 *
 * Ascending because that is how a conversation reads, and because the newest
 * thing belongs at the bottom next to the box you type in. A project channel
 * folds in that project's activity; a general channel has no subject, so it
 * has only what people said.
 */
export async function readChannelFeed(
  actor: Actor,
  channel: ChannelRow,
  limit = 100,
): Promise<FeedEntry[]> {
  const [said, happened] = await Promise.all([
    withOrg(actor.organizationId).selectJoined(
      messages,
      MESSAGE_FIELDS,
      [
        {
          table: users,
          on: eq(users.id, messages.authorUserId),
          type: "inner" as const,
        },
      ],
      eq(messages.channelId, channel.id),
    ) as Promise<Array<Omit<MessageEntry, "kind">>>,
    channel.projectId
      ? listProjectActivity(actor, channel.projectId, limit)
      : Promise.resolve([] as ActivityRow[]),
  ]);

  const entries: FeedEntry[] = [
    ...said.map((row) => ({ ...row, kind: "message" as const })),
    ...happened.map((row) => ({
      kind: "event" as const,
      id: row.id,
      at: row.createdAt,
      verb: row.verb,
      actorName: row.actorName,
      metadata: row.metadata,
      taskId: row.taskId,
    })),
  ];

  return entries.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(-limit);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Put someone in a channel.
 *
 * Idempotent, because it runs every time a channel is opened. Joining is what
 * gives you a read mark, and a read mark is what makes the badge mean
 * something: a channel you have never opened has no unread count because it
 * has no "since when".
 */
export async function joinChannel(
  actor: Actor,
  channelId: string,
  userId = actor.userId,
  executor?: Executor,
): Promise<void> {
  const scope = withOrg(actor.organizationId, executor);

  const existing = await scope.selectFields(
    channelMembers,
    { id: channelMembers.id },
    eq(channelMembers.channelId, channelId),
    eq(channelMembers.userId, userId),
  );
  if (existing.length > 0) return;

  await scope.insert(channelMembers, { channelId, userId });
}

/** Take yourself out of a channel. It leaves the rail; nothing is deleted. */
export async function leaveChannel(actor: Actor, channelId: string): Promise<void> {
  await withOrg(actor.organizationId).delete(
    channelMembers,
    eq(channelMembers.channelId, channelId),
    // Scoped by user as well as by channel: nobody removes anybody else here.
    eq(channelMembers.userId, actor.userId),
  );
}

/** Move this person's read mark to now. */
export async function markChannelRead(actor: Actor, channelId: string): Promise<void> {
  await withOrg(actor.organizationId).update(
    channelMembers,
    { lastReadAt: new Date() },
    eq(channelMembers.channelId, channelId),
    eq(channelMembers.userId, actor.userId),
  );
}

export async function postMessage(
  actor: Actor,
  channelId: string,
  body: string,
): Promise<{ id: string; at: Date } | null> {
  const [created] = await withOrg(actor.organizationId).insert(messages, {
    channelId,
    authorUserId: actor.userId,
    body,
  });

  if (!created) return null;

  // Your own message is read the moment you send it, so the badge never lights
  // up for something you just typed.
  await markChannelRead(actor, channelId);

  return { id: created.id, at: created.createdAt };
}

/**
 * Edits and deletes keep the row and stamp a time.
 *
 * A channel where a message can vanish without trace is one nobody can rely on
 * as the record of a decision -- which is the whole reason talk sits next to
 * the activity feed rather than somewhere else.
 */
export async function editMessage(actor: Actor, messageId: string, body: string): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    messages,
    { body, editedAt: new Date() },
    eq(messages.id, messageId),
    eq(messages.authorUserId, actor.userId),
    isNull(messages.deletedAt),
  );
  return rows.length > 0;
}

export async function deleteMessage(actor: Actor, messageId: string): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    messages,
    { deletedAt: new Date() },
    eq(messages.id, messageId),
    eq(messages.authorUserId, actor.userId),
    isNull(messages.deletedAt),
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Project channels
// ---------------------------------------------------------------------------

/**
 * Give a project its channel, and put its people in it.
 *
 * Called when a project is created, and again lazily the first time an older
 * project's channel is opened -- so the projects that existed before channels
 * did are not left as the only ones with nowhere to talk.
 */
export async function ensureProjectChannel(
  actor: Actor,
  project: { id: string; key: string; name: string },
  executor?: Executor,
): Promise<{ id: string; slug: string }> {
  const scope = withOrg(actor.organizationId, executor);

  const existing = await scope.selectFields(
    channels,
    { id: channels.id, slug: channels.slug },
    eq(channels.projectId, project.id),
  );
  if (existing[0]) return existing[0];

  // Two projects can share a name, and the slug is what the URL is made of, so
  // the key settles the collision rather than the insert failing.
  const taken = new Set(
    (await scope.selectFields(channels, { slug: channels.slug })).map((row) => row.slug),
  );
  let slug = slugify(project.name, project.key);
  if (taken.has(slug)) slug = slugify(`${project.name}-${project.key}`, project.key);

  const [created] = await scope.insert(channels, {
    kind: "project",
    projectId: project.id,
    name: project.name,
    slug,
    createdByUserId: actor.userId,
  });
  if (!created) throw new Error("Could not create the project channel.");

  // Everyone on the project starts in its channel. Being added to a project
  // and then having to find its conversation separately is exactly the kind of
  // "where is it?" this app exists to avoid.
  const people = await scope.selectFields(
    projectMembers,
    { userId: projectMembers.userId },
    eq(projectMembers.projectId, project.id),
  );

  const userIds = new Set(people.map((row) => row.userId));
  userIds.add(actor.userId);

  await scope.insert(
    channelMembers,
    [...userIds].map((userId) => ({ channelId: created.id, userId })),
  );

  return { id: created.id, slug: created.slug };
}
