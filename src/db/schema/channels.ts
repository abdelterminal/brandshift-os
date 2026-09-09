import { sql } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { deals } from "./crm";
import { organizations } from "./organizations";
import { users } from "./people";
import { projects } from "./projects";

/**
 * Channels.
 *
 * The Slack half of the brief, and the thing `activity_events` was designed as
 * a spine for. A project channel is not a separate log running alongside the
 * project's history -- it *is* that history, with people talking in it. The
 * feed interleaves both: "Elena completed a task" and "Elena: can we push the
 * deadline?" belong in one column, in the order they happened, because that is
 * how the day actually went.
 *
 * `deal` exists in the enum but nothing creates one yet; deals arrive with CRM.
 * It is here because the alternative is an enum migration the day they do, and
 * because naming it now records what these are for.
 */
export const channelKindEnum = pgEnum("channel_kind", ["project", "deal", "general"]);

/**
 * Whether someone's seat in a channel is real yet.
 *
 * `active` is the only status that existed before this: everyone who had ever
 * joined a channel, however they got there. `pending` is a request nobody has
 * acted on; `declined` is one somebody said no to, kept rather than deleted so
 * the person who asked reads "not yet" and can ask again, not "never asked".
 */
export const channelMemberStatusEnum = pgEnum("channel_member_status", [
  "active",
  "pending",
  "declined",
]);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: channelKindEnum("kind").notNull().default("general"),
    /** Set for a project channel. One channel per project, enforced below. */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    /** Set for a deal channel. One channel per deal, enforced below. */
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** URL-safe, so a channel can be linked as `/work/MER/channel`. */
    slug: text("slug").notNull(),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("channels_org_slug_key").on(t.organizationId, t.slug),
    // A project has one channel, not several. Partial, so the many general
    // channels with a null project_id do not collide with each other.
    uniqueIndex("channels_project_key")
      .on(t.projectId)
      .where(sql`${t.projectId} is not null`),
    // And a deal has one, for the same reason.
    uniqueIndex("channels_deal_key")
      .on(t.dealId)
      .where(sql`${t.dealId} is not null`),
    index("channels_org_idx").on(t.organizationId),
  ],
);

/**
 * Who is in a channel, and how far they have read.
 *
 * Read state lives here as one timestamp rather than a per-message receipt.
 * "Everything before this moment is read" is what an unread badge needs, and
 * it stays one row per person per channel however long the channel gets.
 *
 * `status` defaults to `active` so every row that existed before it was added
 * is unaffected -- this is a gate on *new* requests, not a retroactive lockout
 * of anyone already in a conversation. `joinChannel()` (provisioning: a
 * project or deal adding its own people) still writes `active` directly;
 * `requestToJoinChannel()` (someone asking to get into a channel they are not
 * otherwise on) is the only path that ever writes `pending`.
 */
export const channelMembers = pgTable(
  "channel_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: channelMemberStatusEnum("status").notNull().default("active"),
    /** Null means they have never opened it, so everything counts as unread. */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    /** Pinned to the top of your own rail. Nobody else's rail is affected. */
    pinned: boolean("pinned").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("channel_members_channel_user_key").on(t.channelId, t.userId),
    index("channel_members_user_idx").on(t.userId),
    index("channel_members_org_idx").on(t.organizationId),
  ],
);

/**
 * What people said.
 *
 * Edits keep the row and stamp `editedAt`; deletes keep the row and stamp
 * `deletedAt`. A channel where messages can vanish without trace is one nobody
 * can rely on as a record of a decision, and the whole point of putting talk
 * next to the activity feed is that the two together explain what happened.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // The channel read: newest first, one index scan.
    index("messages_channel_created_idx").on(t.channelId, t.createdAt),
    index("messages_org_idx").on(t.organizationId),
    index("messages_author_idx").on(t.authorUserId),
  ],
);

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type ChannelMember = typeof channelMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
