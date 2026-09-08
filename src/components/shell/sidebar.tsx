"use client";

import { ChevronDown, ChevronRight, Star } from "lucide-react";
import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";

import { CountBadge } from "@/components/ui/badge";
import { Link, usePathname } from "@/i18n/navigation";
import { setChannelPinnedAction } from "@/lib/actions/channels";
import type { Destination } from "@/lib/navigation";
import { cn } from "@/lib/utils";

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
}: {
  destination: Destination;
  counts?: Partial<Record<string, number>>;
  nested?: boolean;
  /** Only a channel row gets a pin toggle -- a department is not a thing you pin. */
  pinnable?: boolean;
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

  return (
    <span
      className={cn(
        "group relative flex items-center rounded-control",
        active
          ? "bg-sidebar-active-bg"
          : "hover:bg-sidebar-hover",
      )}
    >
      <Link
        href={destination.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-2 text-label",
          nested ? "pl-8" : "pl-3",
          focusRing,
          transition,
          active
            ? "text-accent-text font-semibold"
            : unread
              ? "text-sidebar-fg-active font-semibold"
              : "text-sidebar-fg group-hover:text-sidebar-fg-active",
        )}
      >
        {/* The red bar. Most of the rail's share of the 5% budget. */}
        <span
          aria-hidden
          className={cn(
            "absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-pill",
            active ? "bg-brand" : "bg-transparent",
          )}
        />
        <NavigationDim>
          <Icon aria-hidden className={cn("shrink-0", nested ? "size-3.5" : "size-4")} />
          <span className="truncate">{destination.label ?? t(destination.id)}</span>
        </NavigationDim>

        {count > 0 ? (
          <CountBadge tone="accent" className="ml-auto">
            {count}
          </CountBadge>
        ) : null}

        {destination.expandableChildren && count === 0 && !destination.children?.length ? (
          <ChevronRight
            aria-hidden
            className="text-fg-subtle ml-auto size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          />
        ) : null}
      </Link>

      {pinnable ? (
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
}: {
  destinations: Destination[];
  organizationName: string;
  /** Unread counts by destination id. Only real, actionable numbers belong here. */
  counts?: Partial<Record<string, number>>;
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

  return (
    <nav
      aria-label={t("primary")}
      // Named for the tour, which rings the real rail rather than drawing a
      // picture of one.
      data-tour="rail"
      className="bg-sidebar-surface border-sidebar-border hidden w-56 shrink-0 flex-col border-r md:flex"
    >
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="bg-brand size-5 shrink-0 rounded-[6px]" aria-hidden />
        <span className="text-label text-sidebar-fg-active truncate font-semibold">
          {organizationName}
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {destinations.map((destination) => {
          const hasChildren = (destination.children?.length ?? 0) > 0;
          const isCollapsed = hasChildren && collapsed[destination.id];
          // A channel's own row is pinnable; the trailing "All channels" link
          // is not a channel to pin, it is the way to the rest of them.
          const isChannelSection = destination.expandableChildren === "channels";

          return (
            <li key={destination.id}>
              <div className="flex items-center">
                <RailLink destination={destination} counts={counts} />

                {hasChildren ? (
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
              {hasChildren && !isCollapsed ? (
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
    </nav>
  );
}
