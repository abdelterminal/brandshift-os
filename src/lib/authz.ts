import type { ModulePermissions, Role } from "@/db/schema/people";

/**
 * The only place permission rules live.
 *
 * UI visibility and Server Action enforcement both call `can()`, so a hidden
 * button and a refused action can never disagree. If a rule is written
 * anywhere else, the two will drift and someone will be shown a control that
 * fails when they press it.
 *
 * M3 needs this for the left rail, which is a visibility decision and
 * therefore a permission decision. M4 extends it with the session plumbing,
 * Server Action guards and the re-authentication window; the shape here is
 * built to be extended rather than replaced.
 */

/** Who is asking. Assembled from the session's membership. */
export type Actor = {
  userId: string;
  organizationId: string;
  role: Role;
  permissions: ModulePermissions;
};

/**
 * Named roles, ordered. A role always covers everything the roles beneath it
 * cover, which is what makes `atLeast` a legitimate shorthand.
 */
const ROLE_RANK: Record<Role, number> = {
  member: 0,
  manager: 1,
  admin: 2,
  owner: 3,
};

export function atLeast(actor: Actor, role: Role): boolean {
  return ROLE_RANK[actor.role] >= ROLE_RANK[role];
}

/** Module flags gate whole areas; the role then decides how much of one. */
export type Module = keyof ModulePermissions;

export function hasModule(actor: Actor, module: Module): boolean {
  return actor.permissions[module] === true;
}

/**
 * Everything a person can be permitted to do, named as `subject.verb`.
 *
 * The list is deliberately explicit rather than generated: reading it top to
 * bottom should tell you what the app lets people do.
 */
export type Action =
  // Navigation and reading
  | "today.view"
  | "work.view"
  | "people.view"
  | "insights.view"
  | "inbox.view"
  | "calendar.view"
  | "channel.view"
  // Doing
  | "project.create"
  | "task.create"
  | "channel.post"
  | "meeting.schedule"
  | "meeting.manage"
  | "member.invite"
  | "member.editRole"
  | "organization.switch"
  | "organization.editSettings";

/**
 * What a rule is allowed to look at besides the actor.
 *
 * Deliberately the narrowest shape that answers the question rather than the
 * whole row: a rule that receives an entire meeting is a rule that can start
 * depending on its title.
 */
export type Resource = { organizerUserId?: string | null; ownerUserId?: string | null };

const RULES: Record<Action, (actor: Actor, resource?: Resource) => boolean> = {
  // Everyone with a membership can see their own day and their own work.
  "today.view": () => true,
  "work.view": () => true,
  "inbox.view": () => true,
  "calendar.view": () => true,

  // Channels are how the org talks to itself. Reading and posting are open to
  // every member: a conversation half the company cannot join is a meeting
  // held in a corridor, which is the thing this replaces.
  "channel.view": () => true,
  "channel.post": () => true,

  // The People directory is the org chart, which every member can read. The
  // `people` module flag is what gates the sensitive parts of it -- salaries,
  // contracts -- not the list of who works here.
  "people.view": () => true,

  // Insights is reporting across the whole org, so it needs the module flag.
  "insights.view": (actor) => hasModule(actor, "insights"),

  "project.create": (actor) => atLeast(actor, "manager"),
  "task.create": () => true,

  // Anyone may put a meeting in the diary; in an agency this size, needing
  // permission to ask four people for half an hour is the bottleneck, not the
  // safeguard.
  "meeting.schedule": () => true,

  // Changing or cancelling one is different: it moves other people's day. The
  // organizer may, and an admin may, because somebody has to be able to clear
  // the calendar of a person who has left.
  "meeting.manage": (actor, resource) =>
    resource?.organizerUserId === actor.userId || atLeast(actor, "admin"),

  "member.invite": (actor) => atLeast(actor, "admin") || hasModule(actor, "people"),
  "member.editRole": (actor) => atLeast(actor, "admin"),

  "organization.switch": () => true,
  "organization.editSettings": (actor) => atLeast(actor, "admin"),
};

/**
 * The single question every caller asks.
 *
 *     if (can(actor, "project.create")) { ... }
 *     if (can(actor, "meeting.manage", meeting)) { ... }
 *
 * The resource is the row the rule depends on, for the rules that depend on
 * one. Meetings are the first: whether you may move one is a fact about who
 * called it, not about your role alone.
 */
export function can(actor: Actor, action: Action, resource?: Resource): boolean {
  return RULES[action](actor, resource);
}

/**
 * Every action this actor is allowed, for debugging and for tests.
 *
 * Resource-dependent rules are answered without one, which is the honest
 * reading of "allowed in general": you may manage a meeting you called, and
 * this cannot know which meeting is meant.
 */
export function allowedActions(actor: Actor): Action[] {
  return (Object.keys(RULES) as Action[]).filter((action) => can(actor, action));
}
