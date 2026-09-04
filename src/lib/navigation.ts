import { can, atLeast, hasModule, type Action, type Actor } from "./authz";

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
  | "calendar"
  | "channel"
  | "channels"
  | "leave"
  | "crm"
  | "finance"
  | "objectives"
  | "sops";

export type Destination = {
  /** Key into the `Nav` message catalogue, unless `label` overrides it. */
  id: string;
  href: string;
  icon: NavIconName;
  /**
   * A name that is data rather than vocabulary -- a channel is called whatever
   * somebody called it, in every locale. Catalogue keys stay the default so a
   * fixed destination cannot ship an untranslated label by accident.
   */
  label?: string;
  /**
   * Active only on an exact path match.
   *
   * The default is prefix matching, so /work stays lit while you are on
   * /work/MER. A leaf that sits beside its own children needs the opposite:
   * without this, "All channels" and the open channel are both marked as where
   * you are, and the rail answers "where am I" twice.
   */
  exact?: boolean;
  /** Hidden unless the actor may do this. */
  requires?: Action;
  /** Channels nest under Work. Children are never counted against the cap. */
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
  {
    id: "work",
    href: "/work",
    icon: "work",
    requires: "work.view",
    expandable: true,
  },
  { id: "people", href: "/people", icon: "people", requires: "people.view" },
  {
    id: "insights",
    href: "/insights",
    icon: "insights",
    requires: "insights.view",
  },
  { id: "inbox", href: "/inbox", icon: "inbox", requires: "inbox.view" },
];

/**
 * Client services.
 *
 * A third rail rather than a sixth destination on the second one. The cap of
 * five is what keeps this thing scannable and it is not being bent: somebody
 * whose job is selling gets the pipeline where somebody coordinating delivery
 * gets Insights, and both fit in five.
 *
 * This is the same reasoning that already gives coordinators and members
 * different rails -- "two different jobs, not one job with things hidden".
 * Without it the person who lives in the pipeline was the one person who could
 * only reach it by name in the command palette.
 */
const SALES_RAIL: Destination[] = [
  { id: "today", href: "/today", icon: "today" },
  { id: "crm", href: "/crm", icon: "crm", requires: "crm.view" },
  {
    id: "work",
    href: "/work",
    icon: "work",
    requires: "work.view",
    expandable: true,
  },
  { id: "people", href: "/people", icon: "people", requires: "people.view" },
  { id: "inbox", href: "/inbox", icon: "inbox", requires: "inbox.view" },
];

/**
 * Money.
 *
 * The same argument as the sales rail, one milestone later: somebody who can
 * see the money should not be the one person who has to know its name to reach
 * it. Finance takes the slot Insights holds on the coordination rail.
 *
 * `finance` is checked before `crm` because the owner and the operations lead
 * hold both, and it is the narrower statement of the two about what somebody's
 * day is -- `crm` ends up on every manager who has been near a client, where
 * `finance` is only ever given to the people who send the invoices. Whichever
 * flag loses, its screen is still one keystroke away in the palette.
 */
const FINANCE_RAIL: Destination[] = [
  { id: "today", href: "/today", icon: "today" },
  {
    id: "finance",
    href: "/finance",
    icon: "finance",
    requires: "finance.view",
  },
  {
    id: "work",
    href: "/work",
    icon: "work",
    requires: "work.view",
    expandable: true,
  },
  { id: "people", href: "/people", icon: "people", requires: "people.view" },
  { id: "inbox", href: "/inbox", icon: "inbox", requires: "inbox.view" },
];

const MEMBER_RAIL: Destination[] = [
  { id: "today", href: "/today", icon: "today" },
  {
    id: "myWork",
    href: "/work",
    icon: "myWork",
    requires: "work.view",
    expandable: true,
  },
  {
    id: "calendar",
    href: "/calendar",
    icon: "calendar",
    requires: "calendar.view",
  },
  { id: "inbox", href: "/inbox", icon: "inbox", requires: "inbox.view" },
  { id: "team", href: "/people", icon: "people", requires: "people.view" },
];

/**
 * Every place in the app, whether or not it fits on a rail.
 *
 * The rail holds five. The app has more than five screens, and the ones that
 * do not fit still have to be findable -- a manager has no Calendar on their
 * rail, and before this they could reach it only by typing the URL. This is
 * what the command palette offers, so "somewhere I cannot see is somewhere I
 * cannot get to" stops being true.
 *
 * Profile and Settings are here and not on the rail. The rule is that they
 * have one home in the navigation, which is the avatar menu; being able to
 * jump to them by name is not a second home, it is a shortcut to the one.
 */
export const ALL_DESTINATIONS: Destination[] = [
  { id: "today", href: "/today", icon: "today" },
  { id: "work", href: "/work", icon: "work", requires: "work.view" },
  {
    id: "channels",
    href: "/channels",
    icon: "channels",
    requires: "channel.view",
  },
  {
    id: "calendar",
    href: "/calendar",
    icon: "calendar",
    requires: "calendar.view",
  },
  { id: "inbox", href: "/inbox", icon: "inbox", requires: "inbox.view" },
  { id: "crm", href: "/crm", icon: "crm", requires: "crm.view" },
  {
    id: "finance",
    href: "/finance",
    icon: "finance",
    requires: "finance.view",
  },
  // Objectives is not on any rail. Five is the cap and every rail is full;
  // direction is something people go and look at deliberately, weekly at
  // most, which is exactly what the palette is for. Insights links to it,
  // because "how are we doing" and "against what" are one question.
  { id: "objectives", href: "/objectives", icon: "objectives", requires: "objective.view" },
  // Like Objectives: not on a rail, because five is the cap and a procedure
  // is something you go and look up rather than somewhere you live.
  { id: "sops", href: "/sops", icon: "sops", requires: "sop.view" },
  { id: "leave", href: "/leave", icon: "leave", requires: "leave.view" },
  { id: "people", href: "/people", icon: "people", requires: "people.view" },
  {
    id: "insights",
    href: "/insights",
    icon: "insights",
    requires: "insights.view",
  },
];

/** The ones this person may actually open. */
export function destinationsFor(actor: Actor): Destination[] {
  return ALL_DESTINATIONS.filter((item) => !item.requires || can(actor, item.requires));
}

/**
 * The rail for one person: their role picks the set, `can()` filters it, and
 * the cap is enforced rather than trusted.
 */
export function railFor(actor: Actor): Destination[] {
  // A module decides before the role does. Holding one of these flags is what
  // says what this person's day is, whatever their seniority.
  const rail = hasModule(actor, "finance")
    ? FINANCE_RAIL
    : hasModule(actor, "crm")
      ? SALES_RAIL
      : atLeast(actor, "manager")
        ? ADMIN_RAIL
        : MEMBER_RAIL;
  const visible = rail.filter((item) => !item.requires || can(actor, item.requires));

  if (visible.length > MAX_PRIMARY_DESTINATIONS) {
    throw new Error(
      `The rail may hold at most ${MAX_PRIMARY_DESTINATIONS} primary destinations; got ${visible.length}.`,
    );
  }

  return visible;
}

/**
 * Hang someone's channels under Work.
 *
 * Children, not a sixth destination: the cap of five is what keeps the rail
 * scannable, and a list that grows every time somebody starts a conversation
 * is exactly what the cap exists to keep off it. Nesting also says something
 * true -- a project's channel is part of that work, not a separate place.
 *
 * The last entry is always the way to the full list, because a rail that shows
 * only the channels you are already in offers no way to find the others.
 */
export function withChannels(
  rail: Destination[],
  channels: Array<{ id: string; slug: string; name: string }>,
  allChannelsLabel: string,
): Destination[] {
  return rail.map((destination) => {
    if (!destination.expandable) return destination;

    return {
      ...destination,
      children: [
        ...channels.map((channel) => ({
          id: channel.id,
          href: `/channels/${channel.slug}`,
          icon: "channel" as const,
          label: channel.name,
          requires: "channel.view" as const,
        })),
        {
          id: "channels",
          href: "/channels",
          exact: true,
          icon: "channels" as const,
          label: allChannelsLabel,
          requires: "channel.view" as const,
        },
      ],
    };
  });
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
