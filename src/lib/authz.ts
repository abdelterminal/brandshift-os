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
  // Doing
  | "project.create"
  | "task.create"
  | "member.invite"
  | "member.editRole"
  | "organization.switch"
  | "organization.editSettings";

const RULES: Record<Action, (actor: Actor) => boolean> = {
  // Everyone with a membership can see their own day and their own work.
  "today.view": () => true,
  "work.view": () => true,
  "inbox.view": () => true,
  "calendar.view": () => true,

  // The People directory is the org chart, which every member can read. The
  // `people` module flag is what gates the sensitive parts of it -- salaries,
  // contracts -- not the list of who works here.
  "people.view": () => true,

  // Insights is reporting across the whole org, so it needs the module flag.
  "insights.view": (actor) => hasModule(actor, "insights"),

  "project.create": (actor) => atLeast(actor, "manager"),
  "task.create": () => true,
  "member.invite": (actor) => atLeast(actor, "admin") || hasModule(actor, "people"),
  "member.editRole": (actor) => atLeast(actor, "admin"),

  "organization.switch": () => true,
  "organization.editSettings": (actor) => atLeast(actor, "admin"),
};

/**
 * The single question every caller asks.
 *
 *     if (can(actor, "project.create")) { ... }
 *
 * A resource argument arrives in M5, when rules start depending on the row --
 * "may edit this project because they own it". The signature takes it now so
 * call sites do not have to change.
 */
export function can(actor: Actor, action: Action, _resource?: unknown): boolean {
  return RULES[action](actor);
}

/** Every action this actor is allowed, for debugging and for tests. */
export function allowedActions(actor: Actor): Action[] {
  return (Object.keys(RULES) as Action[]).filter((action) => can(actor, action));
}
