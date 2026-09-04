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
  | "leave.view"
  | "crm.view"
  | "finance.view"
  | "objective.view"
  | "sop.view"
  | "template.view"
  | "review.view"
  // Doing
  | "project.create"
  | "task.create"
  | "channel.post"
  | "meeting.schedule"
  | "meeting.manage"
  | "leave.request"
  | "leave.approve"
  | "crm.manage"
  | "finance.manage"
  | "objective.manage"
  | "objective.record"
  | "sop.manage"
  | "sop.review"
  | "template.manage"
  | "review.manage"
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
export type Resource = {
  organizerUserId?: string | null;
  ownerUserId?: string | null;
  /** The person a record is about -- whose leave, whose profile. */
  userId?: string | null;
};

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

  // Everyone can see the time-off screen and ask for time off. What you see on
  // it differs: your own requests always, the approval queue only if you are
  // one of the people who decides.
  "leave.view": () => true,

  // The People directory is the org chart, which every member can read. The
  // `people` module flag is what gates the sensitive parts of it -- salaries,
  // contracts -- not the list of who works here.
  "people.view": () => true,

  // Insights is reporting across the whole org, so it needs the module flag.
  "insights.view": (actor) => hasModule(actor, "insights"),

  // Who a company is talking to, and what it is worth, is commercial
  // information -- the `crm` module gates the whole area rather than parts of
  // it. Anybody who can see the pipeline can move a deal along it: a CRM where
  // reading and writing are separate permissions is one where the person on the
  // call cannot record what was said.
  "crm.view": (actor) => hasModule(actor, "crm"),
  "crm.manage": (actor) => hasModule(actor, "crm"),

  // What the company is owed and what it has spent is the most sensitive data
  // in here. The `finance` module gates the whole area, and reading and writing
  // are the same flag for the same reason as CRM: the person chasing a payment
  // is the person who records that it arrived.
  "finance.view": (actor) => hasModule(actor, "finance"),
  "finance.manage": (actor) => hasModule(actor, "finance"),

  // Where the company is trying to get to is not privileged information --
  // a goal half the company cannot see is a goal nobody pulls towards, which
  // is the same argument that keeps channels open to everyone. The numbers
  // behind it are the org's own, not anybody's salary.
  "objective.view": () => true,

  // Setting direction is a manager's job, or anybody holding `insights` --
  // the flag that already gates reporting across the whole organization,
  // which is the same question asked in the future tense.
  "objective.manage": (actor) => atLeast(actor, "manager") || hasModule(actor, "insights"),

  // Writing down what a number actually is, though, is open to whoever knows
  // it. Requiring a manager to enter every measurement is how a goal-tracking
  // screen goes stale: the person with the figure is rarely the person with
  // the permission, and a checkpoint carries its author's name either way.
  "objective.record": () => true,

  // How the work is done here is for everyone who does it. A procedure
  // library half the company cannot read is a shared folder with extra steps.
  "sop.view": () => true,

  // A template is how a job is run, which is the same kind of knowledge a
  // procedure is, and open to everyone for the same reason.
  "template.view": () => true,

  // How the company talks about itself, week by week. Open to everyone for
  // the same reason objectives are: a review half the company cannot read is
  // a meeting held in a corridor.
  "review.view": () => true,

  // Holding one, writing it up and publishing it is a manager's job, or
  // anybody holding `insights` -- the flag that already gates reporting
  // across the whole organization.
  "review.manage": (actor) => atLeast(actor, "manager") || hasModule(actor, "insights"),

  // Writing one is a manager's job, and so is starting a project from one --
  // though that second permission is `project.create`, checked where it is
  // used, because reading a template and running a job from it are not the
  // same privilege as deciding what the template says.
  "template.manage": (actor) => atLeast(actor, "manager"),

  // Writing and retiring procedures is a manager's job, or anybody holding
  // `people` -- the flag that already covers how the organization runs
  // itself rather than what it sells.
  "sop.manage": (actor) => atLeast(actor, "manager") || hasModule(actor, "people"),

  // But the six-month check can be done by whoever owns the procedure,
  // whatever their role. Requiring a manager to countersign every review is
  // how a review queue becomes permanently overdue, and an overdue queue
  // nobody is able to clear is worse than having no queue at all.
  "sop.review": (actor, resource) =>
    resource?.ownerUserId === actor.userId ||
    atLeast(actor, "manager") ||
    hasModule(actor, "people"),

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

  "leave.request": () => true,

  /**
   * Deciding on somebody's time off.
   *
   * A manager, or anybody holding the `people` module -- the same flag that
   * gates the sensitive half of the directory, because an approval queue is
   * exactly that. And never your own request, whatever your role: the data
   * layer refuses it too, so this is the visible half of one rule rather than
   * the only half.
   */
  "leave.approve": (actor, resource) =>
    (atLeast(actor, "manager") || hasModule(actor, "people")) && resource?.userId !== actor.userId,

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
