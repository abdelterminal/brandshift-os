"use client";

import { Building2, Compass, FolderKanban, Search, Sun, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { focusRing, transition } from "../ui/styles";

/**
 * Cmd+K.
 *
 * Most of the "feels like Slack" sensation for very little risk: one keystroke
 * that goes anywhere, so the rail never has to grow a sixth destination to
 * make something reachable.
 *
 * The index is handed down from the layout rather than searched on the server.
 * At the size of one agency -- a few dozen projects, people and departments --
 * a round trip per keystroke would be slower and less reliable than filtering
 * in the browser. When an org outgrows that, this becomes a server search and
 * nothing above it changes.
 */

export type PaletteEntry = {
  id: string;
  kind: "destination" | "project" | "person" | "department";
  label: string;
  hint?: string | null;
  href: string;
};

const KIND_ICON = {
  destination: Compass,
  project: FolderKanban,
  person: User,
  department: Building2,
} as const;

/** Case- and accent-insensitive, so "ines" finds "Inès". */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function score(entry: PaletteEntry, query: string): number {
  const label = normalise(entry.label);
  const hint = normalise(entry.hint ?? "");

  if (label.startsWith(query)) return 0;
  // A word boundary beats a match buried mid-word: "reb" should rank
  // "Meridian rebrand" above anything that merely contains those letters.
  if (label.includes(` ${query}`)) return 1;
  if (label.includes(query)) return 2;
  if (hint.includes(query)) return 3;
  return -1;
}

export function CommandPalette({ entries }: { entries: PaletteEntry[] }) {
  const t = useTranslations("Search");
  const actions = useTranslations("Actions");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Cmd+K on a Mac, Ctrl+K everywhere else. `/` is deliberately not bound:
  // it would swallow a keystroke inside every text field on the page.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const trimmed = normalise(query.trim());
  const results = trimmed
    ? entries
        .map((entry) => ({ entry, rank: score(entry, trimmed) }))
        .filter(({ rank }) => rank >= 0)
        .sort((a, b) => a.rank - b.rank || a.entry.label.localeCompare(b.entry.label))
        .slice(0, 12)
        .map(({ entry }) => entry)
    : [];

  // Places first. Somebody who opens this and types three letters is usually
  // trying to get somewhere, not to find a record.
  const groups: Array<[PaletteEntry["kind"], string]> = [
    ["destination", t("groupGoTo")],
    ["project", t("groupProjects")],
    ["person", t("groupPeople")],
    ["department", t("groupDepartments")],
  ];

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      {/*
        One instance only. Rendering a second copy for another breakpoint and
        hiding it with `lg:hidden` does not work: the dialog lives in a portal
        outside that wrapper, so both would open on Cmd+K and stack on top of
        each other. The trigger adapts instead -- an icon on narrow screens,
        a full search field once there is room.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        data-tour="palette"
        className={cn(
          "text-body text-fg-subtle bg-surface-inset border-border-control",
          "hover:border-border-hover hover:text-fg-muted",
          "flex h-9 items-center gap-2 rounded-control border",
          "w-9 justify-center px-0 lg:w-80 lg:justify-start lg:px-3",
          focusRing,
          transition,
        )}
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="hidden truncate lg:inline">{t("open")}</span>
        <kbd className="text-caption border-border bg-surface-raised text-fg-subtle ml-auto hidden rounded-[4px] border px-1.5 py-0.5 lg:block">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showClose={false} className="w-[min(36rem,calc(100vw-2rem))] gap-0 p-0">
          <DialogTitle className="sr-only">{t("open")}</DialogTitle>

          <div className="border-border flex items-center gap-2 border-b px-3">
            <Search aria-hidden className="text-fg-subtle size-4 shrink-0" />
            {/* Not a Combobox: the results are grouped and heterogeneous, and
                the dialog itself owns focus, so a plain input is simpler and
                behaves better with a screen reader. */}
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              className="text-body text-fg-default placeholder:text-fg-subtle h-12 min-w-0 flex-1 bg-transparent outline-none"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-1">
            {!trimmed ? (
              <div className="px-3 py-8 text-center">
                <p className="text-label text-fg-default">{t("hintTitle")}</p>
                <p className="text-body text-fg-muted mt-1">{t("hintBody")}</p>
              </div>
            ) : results.length === 0 ? (
              <p className="text-body text-fg-muted px-3 py-8 text-center">
                {t("empty", { query: query.trim() })}
              </p>
            ) : (
              groups.map(([kind, label]) => {
                const inGroup = results.filter((entry) => entry.kind === kind);
                if (inGroup.length === 0) return null;
                const Icon = KIND_ICON[kind];

                return (
                  <div key={kind}>
                    <p className="text-caption text-fg-muted px-2 py-1.5">{label}</p>
                    {inGroup.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => go(entry.href)}
                        className={cn(
                          "text-body text-fg-default hover:bg-surface-hover",
                          "flex w-full items-center gap-2.5 rounded-[6px] px-2 py-2 text-left",
                          focusRing,
                          transition,
                        )}
                      >
                        <Icon aria-hidden className="text-fg-subtle size-4 shrink-0" />
                        <span className="truncate">{entry.label}</span>
                        {entry.hint ? (
                          <span className="text-caption text-fg-subtle ml-auto shrink-0 truncate">
                            {entry.hint}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                );
              })
            )}

            {!trimmed ? (
              <div className="border-border border-t pt-1">
                <p className="text-caption text-fg-muted px-2 py-1.5">{t("groupActions")}</p>
                <button
                  type="button"
                  onClick={() => go("/today")}
                  className={cn(
                    "text-body text-fg-default hover:bg-surface-hover",
                    "flex w-full items-center gap-2.5 rounded-[6px] px-2 py-2 text-left",
                    focusRing,
                    transition,
                  )}
                >
                  <Sun aria-hidden className="text-fg-subtle size-4 shrink-0" />
                  {actions("goToToday")}
                </button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
