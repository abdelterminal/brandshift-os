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
  | "department"
  | "insights"
  | "inbox"
  | "calendar"
  | "channel"
  | "channels"
  | "leave"
  | "crm"
  | "finance"
  | "objectives"
  | "sops"
  | "documents"
  | "pipeline"
  | "playbook"
  | "templates"
  | "reviews";

/**
 * What can hang under a destination.
 *
 * An array rather than one value, because Work has to be able to carry both:
 * when somebody holds two modules there is no room for People on the rail,
 * and the departments that nest under it would otherwise disappear with it.
 */
export type ExpandableKind = "channels" | "departments";

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
  /** Channels nest under Work, departments under People. Never counted against the cap. */
  children?: Destination[];
  /** A channel pinned to this person's own rail. Nothing else sets this. */
  pinned?: boolean;
  /**
   * What this destination's children are, if it has any -- `withChannels()`
   * and `withDepartments()` each look for their own kind rather than filling
   * in whatever is merely `expandable`, so Work and People can both carry
   * children on the same rail without one overwriting the other's.
   */
  expandableChildren?: ExpandableKind[];
};

/**
 * A coordinator's rail, assembled rather than chosen.
 *
 * There used to be three hand-written lists -- coordination, sales, finance --
 * and `railFor` picked one by checking `finance` then `crm`. That worked for
 * somebody holding exactly one module and quietly failed for anybody holding
 * two: an owner with both `finance` and `crm` got the finance list, which has
 * no CRM entry at all, so holding *more* modules gave them *fewer*
 * destinations. The Pipeline was reachable only by name in the palette, by the
 * person most likely to live in it. Reported as "I don't see any of what you
 * said", which is exactly right.
 *
 * So the rail is built from what somebody actually holds. One rule, applied to
 * everybody, instead of four lists each of which had to remember every case.
 *
 * Members keep their own list below: theirs is a different job rather than a
 * subset of this one, down to the wording -- "My Work" for the person doing it,
 * "Work" for the person assigning it.
 */

const TODAY: Destination = { id: "today", href: "/today", icon: "today" };
const INBOX: Destination = { id: "inbox", href: "/inbox", icon: "inbox", requires: "inbox.view" };

/**
 * A module flag outranks the general screens, for everybody.
 *
 * It is the narrower statement about somebody's day: `finance` is only ever
 * given to the people who send invoices, where every single person has Work.
 * These come first for a member in client services exactly as they do for the
 * owner -- the module says what the job is, and seniority does not change
 * that.
 */
const MODULE_DESTINATIONS: Destination[] = [
  { id: "finance", href: "/finance", icon: "finance", requires: "finance.view" },
  { id: "crm", href: "/crm", icon: "crm", requires: "crm.view" },
];

/**
 * What a coordinator gets after their modules.
 *
 * People and Insights last because they are read weekly rather than lived in,
 * so they are the right things to lose to the palette when somebody holds two
 * modules.
 */
/** Named, because the rail has to ask afterwards whether it kept this one. */
const PEOPLE: Destination = {
  id: "people",
  href: "/people",
  icon: "people",
  requires: "people.view",
  expandableChildren: ["departments"],
};

const COORDINATOR_MIDDLE: Destination[] = [
  {
    id: "work",
    href: "/work",
    icon: "work",
    requires: "work.view",
    expandableChildren: ["channels"],
  },
  PEOPLE,
  { id: "insights", href: "/insights", icon: "insights", requires: "insights.view" },
];

/**
 * And what a member gets.
 *
 * A different job, not a shorter version of the same one -- down to the
 * wording: "My Work" for the person doing it, "Work" for the person handing
 * it out. The calendar earns a slot here that it never does above, because a
 * member's day is largely what is already in it.
 */
const MEMBER_MIDDLE: Destination[] = [
  {
    id: "myWork",
    href: "/work",
    icon: "myWork",
    requires: "work.view",
    expandableChildren: ["channels"],
  },
  { id: "calendar", href: "/calendar", icon: "calendar", requires: "calendar.view" },
  /*
    Inbox sits *inside* a member's list rather than pinned to the end of it,
    which is the one place the two shapes differ.

    `bottomNavFor` takes the first four of the rail and puts the rest under
    More, so pinning Inbox last would push a member's Inbox off their phone --
    and that bar was specified: today, my work, calendar, inbox. A
    coordinator's Inbox is last on every rail and still reaches the bar,
    because exactly three things come before it.
  */
  INBOX,
  {
    id: "team",
    href: "/people",
    icon: "people",
    requires: "people.view",
    expandableChildren: ["departments"],
  },
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
  // Like Objectives and SOPs: reached deliberately, not lived in. The pipeline
  // board is a second view of Work; documents are the prose that hangs off it.
  { id: "pipeline", href: "/work/pipeline", icon: "pipeline", requires: "work.view" },
  { id: "playbook", href: "/playbook", icon: "playbook", requires: "playbook.manage" },
  { id: "documents", href: "/documents", icon: "documents", requires: "document.view" },
  { id: "templates", href: "/templates", icon: "templates", requires: "template.view" },
  { id: "reviews", href: "/reviews", icon: "reviews", requires: "review.view" },
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
  const allowed = (item: Destination) => !item.requires || can(actor, item.requires);

  /*
    Today, then as much of the middle as fits, then Inbox.

    Today and Inbox are the two fixed points -- where you start, and where you
    are interrupted -- so everything else competes for the three slots between
    them rather than against the whole rail. Taking the first three that
    `can()` allows is what makes holding a second module *add* a destination
    instead of silently swapping the whole list, which is the bug this
    replaced.

    The modules come first for everybody, member or owner: somebody in client
    services reaches the pipeline from their rail whatever their role.
  */
  if (!atLeast(actor, "manager")) {
    // Inbox is already in the member list, in the slot the phone bar needs.
    const visible = [TODAY, ...MODULE_DESTINATIONS, ...MEMBER_MIDDLE]
      .filter(allowed)
      .slice(0, MAX_PRIMARY_DESTINATIONS);
    return capped(visible);
  }

  const middle = [...MODULE_DESTINATIONS, ...COORDINATOR_MIDDLE]
    .filter(allowed)
    .slice(0, MAX_PRIMARY_DESTINATIONS - 2);

  /*
    Nothing is lost to the cap.

    Somebody holding both `finance` and `crm` has six things wanting five
    slots, and People is the one that gives way -- but departments hang off
    People, so letting it go would quietly take Strategy, Design and
    Engineering off the rail with it. That is a feature disappearing as a side
    effect of an unrelated flag, which is not a trade anybody chose.

    So Work adopts them. It already carries this person's channels; one
    destination holding two kinds of child is the price of losing none of
    them, and it is only ever paid by the handful of people holding two
    modules at once.
  */
  const lostPeople =
    allowed(PEOPLE) && !middle.some((destination) => destination.id === PEOPLE.id);

  const visible = [TODAY, ...middle, INBOX].filter(allowed).map((destination) =>
    lostPeople && destination.expandableChildren?.includes("channels")
      ? { ...destination, expandableChildren: ["channels", "departments"] as ExpandableKind[] }
      : destination,
  );

  return capped(visible);
}

/** The cap is enforced rather than trusted -- see `MAX_PRIMARY_DESTINATIONS`. */
function capped(visible: Destination[]): Destination[] {
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
  channels: Array<{ id: string; slug: string; name: string; pinned?: boolean }>,
  allChannelsLabel: string,
): Destination[] {
  return rail.map((destination) => {
    if (!destination.expandableChildren?.includes("channels")) return destination;

    return {
      ...destination,
      // Appended, not assigned: `withDepartments` may already have run, and
      // on a rail where Work carries both, whichever ran first would
      // otherwise be thrown away by the second.
      children: [
        ...(destination.children ?? []),
        ...channels.map((channel) => ({
          id: channel.id,
          href: `/channels/${channel.slug}`,
          icon: "channel" as const,
          label: channel.name,
          requires: "channel.view" as const,
          pinned: channel.pinned ?? false,
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
 * Hang someone's departments under People (or Team, for a member).
 *
 * No trailing "see them all" link the way channels get one: the parent row
 * already goes to the unfiltered `/people`, so there is nothing a departments
 * list needs to add a route to reach. A department's own href carries it as a
 * query param rather than a path -- `/people` is the one page that reads it --
 * so unlike a channel, a selected department does not light up its own row:
 * the rail can truthfully say "you are in People" and no more specifically
 * than that, which is what the query param actually is.
 *
 * An organization with none yet -- every fresh `/signup` -- gets an empty
 * `children` array rather than this being skipped: `Sidebar` already treats
 * empty the same as absent, so nothing renders until the first department
 * exists, and it appears the next time this runs with no other change needed.
 */
export function withDepartments(
  rail: Destination[],
  departments: Array<{ id: string; name: string }>,
): Destination[] {
  return rail.map((destination) => {
    if (!destination.expandableChildren?.includes("departments")) return destination;

    return {
      ...destination,
      children: [
        ...(destination.children ?? []),
        ...departments.map((department) => ({
          id: department.id,
          href: `/people?department=${department.id}`,
          icon: "department" as const,
          label: department.name,
          requires: "people.view" as const,
        })),
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
