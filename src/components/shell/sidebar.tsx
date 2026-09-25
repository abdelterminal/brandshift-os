"use client";

import { ChevronDown, ChevronRight, PanelLeft, Star } from "lucide-react";
import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";

import { CountBadge } from "@/components/ui/badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Link, usePathname } from "@/i18n/navigation";
import { setChannelPinnedAction } from "@/lib/actions/channels";
import { withBasePath } from "@/lib/base-path";
import type { Destination } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { AccountMenu } from "./switchers";

import { disabled, focusRing, transition, transitionOpacity } from "../ui/styles";
import { NAV_ICONS } from "./nav-icons";

/**
 * Which parent rows are collapsed, kept per browser rather than per person:
 * this is a convenience for a screen with limited room, not a preference
 * worth a round trip.
 *
 * Read through `useSyncExternalStore`, the same pattern the command palette
 * uses for its recent-searches list -- the server has no opinion on this, and
 * a plain `useState` seeded in an effect is what the `react-hooks` lint rule
 * flags as a cascading render.
 */
const COLLAPSE_KEY = "brandshift.sidebar.collapsed";
const COLLAPSE_EVENT = "brandshift:sidebar-collapse";

function subscribeCollapsed(notify: () => void) {
  window.addEventListener(COLLAPSE_EVENT, notify);
  return () => window.removeEventListener(COLLAPSE_EVENT, notify);
}

function readCollapsedJson(): string {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) ?? "{}";
  } catch {
    // Private browsing, or a browser that blocks storage. A section that
    // cannot remember being collapsed is not worth failing the rail over.
    return "{}";
  }
}

function parseCollapsed(json: string): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Whether the whole rail is folded down to icons.
 *
 * A cookie rather than `localStorage`, which is the one place this parts
 * company with the section state above. The sections only change what is
 * inside the rail; folding changes the rail from 224px to 64px, and every
 * layout beside it. Kept in `localStorage`, the server would render the wide
 * rail, hydration would snap it narrow, and the whole page would jump on every
 * single load. A cookie is on the request, so the server renders the width the
 * reader already chose and nothing moves.
 *
 * It is read from `document.cookie` on the client too, so there is exactly one
 * source and the two renders cannot disagree.
 */
const RAIL_COOKIE = "brandshift.rail";
const RAIL_EVENT = "brandshift:sidebar-railed";
/** A year. A layout preference should not quietly expire mid-week. */
const RAIL_MAX_AGE = 60 * 60 * 24 * 365;

function subscribeRailed(notify: () => void) {
  window.addEventListener(RAIL_EVENT, notify);
  return () => window.removeEventListener(RAIL_EVENT, notify);
}

function readRailed(): boolean {
  return document.cookie.split("; ").includes(`${RAIL_COOKIE}=1`);
}

function writeRailed(next: boolean) {
  // `SameSite=Lax` because nothing cross-site has any business reading how
  // wide somebody likes their sidebar.
  document.cookie = next
    ? `${RAIL_COOKIE}=1; path=/; max-age=${RAIL_MAX_AGE}; SameSite=Lax`
    : `${RAIL_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  window.dispatchEvent(new Event(RAIL_EVENT));
}

/**
 * The left rail.
 *
 * At most five destinations, enforced in `railFor()`. The active one is marked
 * three ways -- a red bar, a tinted ground and a weight change -- because
 * "where am I" is the single question this app most needs to answer at a
 * glance, and colour alone would not answer it for everyone.
 */

/** Active if it is the page, or an ancestor of it: /work matches /work/MER. */
function isActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A quiet "this is loading" on the one row that was actually clicked.
 *
 * `useLinkStatus` only answers for the nearest ancestor `Link`, so this has to
 * be a real descendant component rather than a value read in `RailLink`
 * itself, which is the component doing the rendering, not a child of it. Most
 * of the time this will never visibly fire -- Next prefetches a rail link the
 * moment it is in view, and a prefetched navigation skips the pending phase
 * entirely. It earns its keep on the destinations that are not fully
 * prefetched yet, or on a slow connection, which is exactly when a "nothing
 * happened" pause is worth a word.
 */
function NavigationDim({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn("flex min-w-0 items-center gap-2.5", transitionOpacity, pending && "opacity-60")}
    >
      {children}
    </span>
  );
}

/**
 * One row of the rail, at either level.
 *
 * Shared rather than duplicated so a channel gets the same active treatment as
 * a primary destination -- the red bar, the tinted ground and the weight
 * change together, because "where am I" is the question this rail exists to
 * answer and colour alone would not answer it for everyone.
 */
function RailLink({
  destination,
  counts,
  nested = false,
  pinnable = false,
  railed = false,
}: {
  destination: Destination;
  counts?: Partial<Record<string, number>>;
  nested?: boolean;
  /** Only a channel row gets a pin toggle -- a department is not a thing you pin. */
  pinnable?: boolean;
  /** Folded to icons: the label becomes a tooltip and the row centres. */
  railed?: boolean;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const active = isActive(pathname, destination.href, destination.exact);
  const Icon = NAV_ICONS[destination.icon];
  const count = counts?.[destination.id] ?? 0;
  // Unread is its own visual weight, distinct from "this is where you are":
  // Slack bolds an unread channel's name for the same reason -- a badge alone
  // is easy to miss in a list of a dozen rows, bold text is not.
  const unread = !active && count > 0;

  const pinned = destination.pinned ?? false;

  function togglePin() {
    startTransition(async () => {
      await setChannelPinnedAction(destination.id, !pinned);
      router.refresh();
    });
  }

  const label = destination.label ?? t(destination.id);

  const link = (
    <Link
      href={destination.href}
      aria-current={active ? "page" : undefined}
      // Folded, the name is gone from the page but not from the accessibility
      // tree -- the tooltip supplies it on hover and focus, and this keeps it
      // for anyone reading the link out of context.
      aria-label={railed ? label : undefined}
      className={cn(
        "relative flex min-w-0 items-center gap-2.5 text-label",
        // Folded, the row stops being a row: a 40px square target with the
        // icon centred in it, rather than a full-width strip with a 16px mark
        // floating in the middle of it.
        railed
          ? "size-10 flex-none justify-center rounded-control px-0"
          : cn("flex-1 py-2", nested ? "pr-2 pl-8" : "pr-2 pl-3"),
        focusRing,
        transition,
        active
          ? "text-accent-text font-semibold"
          : unread
            ? "text-sidebar-fg-active font-semibold"
            : "text-sidebar-fg group-hover:text-sidebar-fg-active",
      )}
    >
      {/* The red bar. Most of the rail's share of the 5% budget. Folded there
          is no strip for it to sit beside, so the tinted ground and the accent
          icon carry "you are here" instead -- still two signals, not one. */}
      {railed ? null : (
        <span
          aria-hidden
          className={cn(
            "absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-pill",
            active ? "bg-brand" : "bg-transparent",
          )}
        />
      )}
      <NavigationDim>
        <Icon
          aria-hidden
          className={cn("shrink-0", railed ? "size-5" : nested ? "size-3.5" : "size-4")}
        />
        {railed ? null : <span className="truncate">{label}</span>}
      </NavigationDim>

      {count > 0 && !railed ? (
        <CountBadge tone="accent" className="ml-auto">
          {count}
        </CountBadge>
      ) : null}

      {/* Folded there is no room for a number, but an unread channel still has
          to be findable: a dot on the icon, the same signal the row's bold
          text carries when the rail is open. */}
      {count > 0 && railed ? (
        <span
          aria-hidden
          className="bg-brand absolute top-1 right-1 size-1.5 rounded-pill"
        />
      ) : null}

      {destination.expandableChildren && count === 0 && !destination.children?.length && !railed ? (
        <ChevronRight
          aria-hidden
          className="text-fg-subtle ml-auto size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        />
      ) : null}
    </Link>
  );

  return (
    <span
      className={cn(
        "group relative flex items-center rounded-control",
        // Matched to the link inside it, so the active tint is a clean square
        // tile rather than a band wider than the icon sitting in it.
        railed && "mx-auto size-10 justify-center",
        active
          ? "bg-sidebar-active-bg"
          : "hover:bg-sidebar-hover",
      )}
    >
      {railed ? <SimpleTooltip content={label}>{link}</SimpleTooltip> : link}

      {pinnable && !railed ? (
        <button
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={togglePin}
          aria-pressed={pinned}
          aria-label={pinned ? t("unpinChannel") : t("pinChannel")}
          className={cn(
            "mr-1.5 shrink-0 rounded-control p-1 text-fg-subtle hover:text-sidebar-fg-active",
            pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            focusRing,
            transition,
            disabled,
          )}
        >
          <Star aria-hidden className={cn("size-3.5", pinned && "fill-current")} />
        </button>
      ) : null}
    </span>
  );
}

export function Sidebar({
  destinations,
  organizationName,
  counts,
  account,
  defaultRailed = false,
}: {
  destinations: Destination[];
  organizationName: string;
  /** Read from the rail cookie on the server, so SSR matches the first client render. */
  defaultRailed?: boolean;
  /** Unread counts by destination id. Only real, actionable numbers belong here. */
  counts?: Partial<Record<string, number>>;
  /**
   * Anchors the account menu to the foot of the rail -- the one place it
   * lives on a screen wide enough to have a rail at all, so the header does
   * not carry it too. `undefined` on the rare render with nobody signed in
   * yet leaves the rail exactly as tall as its destinations.
   */
  account?: {
    name: string;
    email: string;
    role: "owner" | "admin" | "manager" | "member";
    avatarUrl?: string | null;
  };
}) {
  const t = useTranslations("Nav");

  // Every collapsed section on this device, never on the server: it renders
  // fully expanded there, which is also the correct empty state for a
  // browser with storage blocked entirely.
  const collapsedJson = useSyncExternalStore(subscribeCollapsed, readCollapsedJson, () => "{}");
  const collapsed = parseCollapsed(collapsedJson);

  function toggleSection(id: string) {
    const next = { ...collapsed, [id]: !collapsed[id] };
    try {
      window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      // Nothing to persist to. The event still fires, so this render updates.
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }

  // The server already read the cookie and passed it down, so the first client
  // render matches the HTML and the rail never jumps width on load.
  const railed = useSyncExternalStore(subscribeRailed, readRailed, () => defaultRailed);

  return (
    <nav
      aria-label={t("primary")}
      // Named for the tour, which rings the real rail rather than drawing a
      // picture of one.
      data-tour="rail"
      className={cn(
        "bg-sidebar-surface border-sidebar-border hidden shrink-0 flex-col border-r md:flex",
        // A width transition, which is neither opacity nor colour, so it is a
        // deliberate exception to that rule -- the third named one, after
        // dnd-kit's drag transforms and the wordmark's arrival trace. Folding
        // the rail moves every pixel of the page beside it; done instantly it
        // reads as a glitch rather than as a thing the reader just did. 150ms
        // sits inside the same 120-180ms window everything else uses, and the
        // global `prefers-reduced-motion` rule in `globals.css` already
        // collapses it to nothing for anyone who asked for that.
        "transition-[width] duration-150 ease-out",
        railed ? "w-16" : "w-56",
      )}
    >
      <div className={cn("flex h-14 items-center justify-center", railed ? "px-2" : "px-4")}>
        {/* A static asset under public/, no JS needed. Colour-stable across
            both themes (red + blue only -- see
            src/components/brand/wordmark.tsx), so unlike the wordmark it needs
            no light/dark pair. Sized by height, not `size-*`: the open mark is
            a wide lockup (943x204), so a fixed width would distort it.

            Folded, that lockup has nowhere to go at 64px. The square icon is
            the same mark's head, already the one used wherever space is tight
            (it is the favicon). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
        <img
          src={withBasePath(
            railed ? "/brand/mediast-icon.svg" : "/brand/mediast-creative-point.svg",
          )}
          alt=""
          aria-hidden
          className={cn("w-auto shrink-0 object-contain", railed ? "h-6" : "h-5")}
        />
        {/* Not shown -- the mark carries the brand on its own now -- but
            still announced, so a screen reader still gets which
            organization this is. */}
        <span className="sr-only">{organizationName}</span>
      </div>

      {/* `overflow-x-hidden` matters during the fold: expanding mounts the
          labels at full width while the rail is still narrow, and without it
          that overshoot flashes a horizontal scrollbar for a frame. */}
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
        {destinations.map((destination) => {
          const hasChildren = (destination.children?.length ?? 0) > 0;
          const isCollapsed = hasChildren && collapsed[destination.id];
          // A channel's own row is pinnable; the trailing "All channels" link
          // is not a channel to pin, it is the way to the rest of them.
          const isChannelSection = destination.expandableChildren === "channels";

          return (
            <li key={destination.id}>
              <div className="flex items-center">
                <RailLink destination={destination} counts={counts} railed={railed} />

                {hasChildren && !railed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(destination.id)}
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed
                        ? t("expandSection", { name: destination.label ?? t(destination.id) })
                        : t("collapseSection", { name: destination.label ?? t(destination.id) })
                    }
                    className={cn(
                      "text-fg-subtle hover:text-sidebar-fg-active mr-1 shrink-0 rounded-control p-1",
                      focusRing,
                      transition,
                    )}
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn("size-3.5 transition-transform", isCollapsed && "-rotate-90")}
                    />
                  </button>
                ) : null}
              </div>

              {/*
                Channels and departments, nested. They are children rather
                than a sixth destination because the cap of five is what
                keeps this rail scannable -- and because a project's channel
                belongs to that work, not beside it.
              */}
              {/* A 56px rail has no room for a tree. The children stay
                  reachable from the destination's own page. */}
              {hasChildren && !isCollapsed && !railed ? (
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {destination.children!.map((child) => (
                    <li key={child.id}>
                      <RailLink
                        destination={child}
                        counts={counts}
                        nested
                        pinnable={isChannelSection && child.href !== "/channels"}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/*
        The floor of the rail. A short destination list -- a role with one
        channel and a handful of departments -- otherwise trails off into
        empty space with nothing at the bottom to say the rail is finished,
        not broken. This is the same account menu the header used to carry
        alone; moving it here means the header no longer needs it, not a
        second way to reach it.
      */}
      <div className="border-sidebar-border border-t p-2">
        <button
          type="button"
          onClick={() => writeRailed(!railed)}
          aria-expanded={!railed}
          aria-label={railed ? t("expandRail") : t("collapseRail")}
          className={cn(
            "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-active rounded-control flex items-center gap-2.5 text-label",
            railed ? "mx-auto size-10 justify-center px-0" : "w-full px-3 py-2",
            focusRing,
            transition,
          )}
        >
          <PanelLeft aria-hidden className={cn("shrink-0", railed ? "size-5" : "size-4")} />
          {railed ? null : <span className="truncate">{t("collapseRail")}</span>}
        </button>
      </div>

      {account ? (
        <div
          className={cn(
            "border-sidebar-border border-t p-2",
            // Folded it falls back to the avatar-only trigger the mobile
            // header uses, which has no width of its own -- so centre it.
            railed && "flex justify-center",
          )}
        >
          <AccountMenu
            name={account.name}
            email={account.email}
            role={account.role}
            avatarUrl={account.avatarUrl}
            expanded={!railed}
          />
        </div>
      ) : null}
    </nav>
  );
}
