"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { CountBadge } from "@/components/ui/badge";
import { Link, usePathname } from "@/i18n/navigation";
import type { Destination } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { focusRing, transition } from "../ui/styles";
import { NAV_ICONS } from "./nav-icons";

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
}: {
  destination: Destination;
  counts?: Partial<Record<string, number>>;
  nested?: boolean;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  const active = isActive(pathname, destination.href, destination.exact);
  const Icon = NAV_ICONS[destination.icon];
  const count = counts?.[destination.id] ?? 0;

  return (
    <Link
      href={destination.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-control py-2 pr-2 text-label",
        nested ? "pl-8" : "pl-3",
        focusRing,
        transition,
        active
          ? "bg-sidebar-active-bg text-accent-text font-semibold"
          : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-active",
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
      <Icon aria-hidden className={cn("shrink-0", nested ? "size-3.5" : "size-4")} />
      <span className="truncate">{destination.label ?? t(destination.id)}</span>

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
        {destinations.map((destination) => (
          <li key={destination.id}>
            <RailLink destination={destination} counts={counts} />

            {/*
              Channels, nested. They are children rather than a sixth
              destination because the cap of five is what keeps this rail
              scannable -- and because a project's channel belongs to that
              work, not beside it.
            */}
            {destination.children && destination.children.length > 0 ? (
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {destination.children.map((child) => (
                  <li key={child.id}>
                    <RailLink destination={child} counts={counts} nested />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
