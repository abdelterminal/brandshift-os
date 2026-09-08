"use client";

import { useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import type { Destination } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../ui/drawer";
import { focusRing, transition } from "../ui/styles";
import { NAV_ICONS } from "./nav-icons";

/**
 * Mobile navigation.
 *
 * Four destinations plus More, so every target stays wide enough for a thumb.
 * The rail's fifth item lives behind More rather than being dropped -- it is
 * still reachable, just one tap further away.
 */

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({
  destinations,
  overflow,
  counts,
}: {
  destinations: Destination[];
  overflow: Destination[];
  counts?: Partial<Record<string, number>>;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const ui = useTranslations("Ui");
  const [open, setOpen] = useState(false);
  const groups = [
    ["workGroup", ["today", "work", "people", "inbox", "calendar", "leave", "channels"]],
    ["planGroup", ["objectives", "insights", "reviews"]],
    ["libraryGroup", ["sops", "templates"]],
    ["commercialGroup", ["crm", "finance"]],
  ] as const;

  const item = cn(
    "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-control px-1 py-2 text-caption",
    focusRing,
    transition,
  );

  return (
    <nav
      data-tour="mobile-nav"
      aria-label={t("primary")}
      className={cn(
        "bg-surface-raised border-border fixed inset-x-0 bottom-0 z-40 flex border-t px-1 md:hidden",
        // Clears the home indicator on phones that have one.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {destinations.map((destination) => {
        const active = isActive(pathname, destination.href);
        const Icon = NAV_ICONS[destination.icon];
        const count = counts?.[destination.id] ?? 0;

        return (
          <Link
            key={destination.id}
            href={destination.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              item,
              active ? "text-accent-text font-medium" : "text-fg-muted hover:text-fg-default",
            )}
          >
            <span className="relative">
              <Icon aria-hidden className="size-5" />
              {count > 0 ? (
                <span
                  aria-hidden
                  className="bg-accent absolute -top-0.5 -right-1 size-2 rounded-pill"
                />
              ) : null}
            </span>
            <span className="truncate">
              {t(destination.id)}
              {count > 0 ? <span className="sr-only"> ({count})</span> : null}
            </span>
          </Link>
        );
      })}

      {overflow.length > 0 ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger className={cn(item, overflow.some(d => isActive(pathname, d.href)) && !destinations.some(d => isActive(pathname, d.href)) ? "text-accent-text font-medium" : "text-fg-muted hover:text-fg-default")}>
            <MoreHorizontal aria-hidden className="size-5" />
            <span>{t("more")}</span>
          </DrawerTrigger>
          <DrawerContent className="w-full max-w-md">
            <DrawerHeader>
              <DrawerTitle>{t("more")}</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="pb-8">
              <button type="button" onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event("brandshift:open-search"));
              }} className={cn("text-body bg-surface-inset border-border-control mb-5 flex w-full items-center gap-3 rounded-control border p-3 text-left", focusRing)}>
                <Search aria-hidden className="size-4" />{ui("searchAll")}
              </button>
              {groups.map(([label, ids]) => {
                const items = overflow.filter(d => (ids as readonly string[]).includes(d.id));
                if (!items.length) return null;
                return <section key={label} className="mb-5" aria-labelledby={label}>
                  <h2 id={label} className="text-caption text-fg-muted mb-1 px-3">{ui(label)}</h2>
                  <ul className="flex flex-col gap-1">
                    {items.map(destination => {
                      const Icon = NAV_ICONS[destination.icon];
                      const active = isActive(pathname, destination.href);
                      const count = counts?.[destination.id] ?? 0;
                      return <li key={destination.id}>
                        <Link href={destination.href} onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn("text-body flex items-center gap-3 rounded-control px-3 py-3",
                            active ? "bg-accent-subtle text-accent-text font-medium" : "text-fg-default hover:bg-surface-hover",
                            focusRing, transition)}>
                          <Icon aria-hidden className="size-4 shrink-0" />
                          <span className="min-w-0 truncate">{t(destination.id)}</span>
                          {count > 0 ? <span className="text-caption ml-auto tabular-nums">{count}</span> : null}
                        </Link>
                      </li>;
                    })}
                  </ul>
                </section>;
              })}
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      ) : null}
    </nav>
  );
}
