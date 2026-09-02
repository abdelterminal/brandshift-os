import { can, atLeast, type Action, type Actor } from "./authz";

/**
 * The left rail.
 *
 * Hard cap of five primary destinations. The previous app grew a sidebar
 * nobody could scan, and the cap is the mechanism that stops that happening
 * again -- `railFor()` throws rather than quietly rendering a sixth.
 *
 * Profile and Settings are deliberately absent. They live in the avatar menu
 * and nowhere else; two homes for the same thing is how people end up unsure
 * which one they are looking at.
 */

export const MAX_PRIMARY_DESTINATIONS = 5;

/**
 * Icons are named, not imported, here. The rail is assembled on the server and
 * handed to a Client Component, and a React component is a function -- which
 * cannot cross that boundary. `src/components/shell/nav-icons.ts` resolves the
 * name on the client side.
 */
export type NavIconName =
  | "today"
  | "work"
  | "myWork"
  | "people"
  | "insights"
  | "inbox"
  | "calendar";

export type Destination = {
  /** Key into the `Nav` message catalogue. */
  id: string;
  href: string;
  icon: NavIconName;
  /** Hidden unless the actor may do this. */
  requires?: Action;
  /**
   * Phase 2 nests project and deal channels under Work. The field exists now
   * so the rail's shape does not have to change when it arrives, and so a
   * destination that will grow children is marked as such today.
   */
  children?: Destination[];
  expandable?: boolean;
};

/**
 * Admins coordinate: they need the whole org's work and the people in it.
 * Members do their own work: their tasks, their calendar, their team.
 *
 * These are two different jobs, not one job with things hidden, which is why
 * the rails differ in wording as well as membership -- "Work" for the person
 * who assigns it, "My Work" for the person who does it.
 */
const ADMIN_RAIL: Destination[] = [
  { id: "today", href: "/today", icon: "today" },
  { id: "work", href: "/work", icon: "work", requires: "work.view", expandable: true },
  { id: "people", href: "/people", icon: "people", requires: "people.view" },
  { id: "insights", href: "/insights", icon: "insights", requires: "insights.view" },
  { id: "inbox", href: "/inbox", icon: "inbox", requires: "inbox.view" },
];

const MEMBER_RAIL: Destination[] = [
  { id: "today", href: "/today", icon: "today" },
  { id: "myWork", href: "/work", icon: "myWork", requires: "work.view", expandable: true },
  { id: "calendar", href: "/calendar", icon: "calendar", requires: "calendar.view" },
  { id: "inbox", href: "/inbox", icon: "inbox", requires: "inbox.view" },
  { id: "team", href: "/people", icon: "people", requires: "people.view" },
];

/**
 * The rail for one person: their role picks the set, `can()` filters it, and
 * the cap is enforced rather than trusted.
 */
export function railFor(actor: Actor): Destination[] {
  const rail = atLeast(actor, "manager") ? ADMIN_RAIL : MEMBER_RAIL;
  const visible = rail.filter((item) => !item.requires || can(actor, item.requires));

  if (visible.length > MAX_PRIMARY_DESTINATIONS) {
    throw new Error(
      `The rail may hold at most ${MAX_PRIMARY_DESTINATIONS} primary destinations; got ${visible.length}.`,
    );
  }

  return visible;
}

/**
 * Mobile bottom nav: Today, Work, Calendar, Inbox, then More.
 *
 * Four destinations plus an overflow, so the thumb targets stay wide enough to
 * hit. "More" opens a sheet holding whatever the rail has that this does not.
 */
export function bottomNavFor(actor: Actor): Destination[] {
  // The first four of the same rail, in the same order. Deriving it rather
  // than listing it separately is what stops the two navigations disagreeing
  // about what exists -- and for a member it produces exactly
  // Today / My Work / Calendar / Inbox, with Team behind More.
  return railFor(actor).slice(0, 4);
}

/** What "More" holds: everything in the rail the bottom nav could not fit. */
export function overflowFor(actor: Actor): Destination[] {
  return railFor(actor).slice(4);
}
