"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { focusRing, transition } from "../ui/styles";

/**
 * Breadcrumbs.
 *
 * "A user must never feel lost" is the whole brief, and this is the smallest
 * thing that answers it: where you are, and one click back to each level above.
 *
 * The trail is derived from the path. Segments that name a record -- a project
 * key, a person's id -- are shown raw here; M5's detail pages replace them with
 * the record's own name, which is why the last crumb is a slot rather than
 * always being computed.
 */

/** Path segments named in the `Nav` catalogue. */
const NAV_SEGMENTS = new Set([
  "today",
  "work",
  "people",
  "insights",
  "inbox",
  "calendar",
  "channels",
  "team",
  "myWork",
]);

/**
 * Segments named elsewhere. Profile and Settings live in the avatar menu, so
 * their labels live in `Account` rather than `Nav` -- without this they showed
 * as the raw path segment, lowercase.
 */
const ACCOUNT_SEGMENTS = new Set(["profile", "settings"]);

export function Breadcrumbs({ trailingLabel }: { trailingLabel?: string }) {
  const t = useTranslations("Nav");
  const account = useTranslations("Account");
  const shell = useTranslations("Shell");
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => ({
    segment,
    href: `/${segments.slice(0, index + 1).join("/")}`,
    label: NAV_SEGMENTS.has(segment)
      ? t(segment)
      : ACCOUNT_SEGMENTS.has(segment)
        ? account(segment as "profile" | "settings")
        : segment,
    last: index === segments.length - 1,
  }));

  return (
    <nav aria-label={shell("breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1">
        {crumbs.map((crumb) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-1">
            {crumb.last ? (
              <span
                aria-current="page"
                className="text-label text-fg-default truncate font-medium"
              >
                {trailingLabel ?? crumb.label}
              </span>
            ) : (
              <>
                <Link
                  href={crumb.href}
                  className={cn(
                    "text-label text-fg-muted hover:text-fg-default truncate rounded-[6px] px-1 py-0.5",
                    focusRing,
                    transition,
                  )}
                >
                  {crumb.label}
                </Link>
                <ChevronRight aria-hidden className="text-fg-subtle size-3.5 shrink-0" />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
