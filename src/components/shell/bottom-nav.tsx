"use client";

import { MoreHorizontal } from "lucide-react";
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

  const item = cn(
    "flex flex-1 flex-col items-center gap-1 rounded-control px-1 py-2 text-caption",
    focusRing,
    transition,
  );

  return (
    <nav
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
        <Drawer>
          <DrawerTrigger className={cn(item, "text-fg-muted hover:text-fg-default")}>
            <MoreHorizontal aria-hidden className="size-5" />
            <span>{t("more")}</span>
          </DrawerTrigger>
          <DrawerContent className="h-auto w-full border-t border-l-0">
            <DrawerHeader>
              <DrawerTitle>{t("more")}</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="pb-8">
              <ul className="flex flex-col gap-1">
                {overflow.map((destination) => {
                  const Icon = NAV_ICONS[destination.icon];
                  return (
                    <li key={destination.id}>
                      <Link
                        href={destination.href}
                        className={cn(
                          "text-body text-fg-default hover:bg-surface-hover flex items-center gap-3 rounded-control px-3 py-3",
                          focusRing,
                          transition,
                        )}
                      >
                        <Icon aria-hidden className="text-fg-subtle size-4" />
                        {t(destination.id)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      ) : null}
    </nav>
  );
}
