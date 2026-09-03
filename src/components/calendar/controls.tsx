import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { addDays, endOfMonth, startOfMonth, startOfWeek } from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";

/**
 * What the calendar is showing, and how to change it.
 *
 * Every control is a link, and every choice is in the URL. A calendar you
 * cannot send someone -- "look at the week of the 14th, everyone's" -- is one
 * people describe to each other over the phone instead.
 *
 * Three questions, in the order they get asked: which stretch of time, whose,
 * and laid out how. The layout choice comes last because it is the one that
 * matters least: the agenda is the default and answers most days on its own.
 */

export type CalendarView = "agenda" | "month";
export type CalendarRange = "week" | "month";
export type CalendarWho = "mine" | "all";

export type CalendarState = {
  /** First day shown, `YYYY-MM-DD`. */
  from: string;
  range: CalendarRange;
  view: CalendarView;
  who: CalendarWho;
};

/** Where a state points. The one place a calendar URL is spelled. */
export function calendarHref(state: CalendarState): string {
  const params = new URLSearchParams({
    from: state.from,
    range: state.range,
    view: state.view,
    who: state.who,
  });
  return `/calendar?${params.toString()}`;
}

/** The window a state covers: `[from, to)`, so nothing lands on two screens. */
export function windowFor(state: CalendarState): { from: string; to: string } {
  return state.range === "week"
    ? { from: state.from, to: addDays(state.from, 7) }
    : { from: startOfMonth(state.from), to: endOfMonth(state.from) };
}

/**
 * The days a month grid actually draws.
 *
 * It renders whole weeks, so the last days of the previous month and the first
 * of the next are on screen. Fetching only the month leaves those cells
 * permanently empty -- which does not read as "outside the month", it reads as
 * "nothing happened", and the agenda for the same days says otherwise.
 */
export function gridBoundsFor(bounds: { from: string; to: string }): {
  from: string;
  to: string;
} {
  const from = startOfWeek(bounds.from);
  let to = bounds.to;
  // Round up to the end of the week the month ends in.
  while (startOfWeek(to) !== to) to = addDays(to, 1);
  return { from, to };
}

function step(state: CalendarState, direction: 1 | -1): CalendarState {
  if (state.range === "week") return { ...state, from: addDays(state.from, 7 * direction) };

  const first = startOfMonth(state.from);
  return {
    ...state,
    from: direction === 1 ? endOfMonth(first) : startOfMonth(addDays(first, -1)),
  };
}

export async function CalendarControls({
  state,
  today,
  label,
}: {
  state: CalendarState;
  today: string;
  /** The range in words -- "1 - 7 September" -- formatted by the page. */
  label: string;
}) {
  const t = await getTranslations("Calendar");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex items-center gap-1">
        <ArrowLink href={calendarHref(step(state, -1))} label={t("previous")} direction="back" />
        <ArrowLink href={calendarHref(step(state, 1))} label={t("next")} direction="forward" />
        <Link
          href={calendarHref({ ...state, from: today })}
          className={cn(
            "text-label text-fg-muted hover:text-fg-default hover:bg-surface-hover rounded-control px-2.5 py-1.5",
            focusRing,
            transition,
          )}
        >
          {t("today")}
        </Link>
      </div>

      <p className="text-label text-fg-default font-medium tabular-nums">{label}</p>

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <SegmentedLinks
          legend={t("rangeLabel")}
          options={[
            { value: "week", label: t("week"), href: calendarHref({ ...state, range: "week" }) },
            { value: "month", label: t("month"), href: calendarHref({ ...state, range: "month" }) },
          ]}
          current={state.range}
        />
        <SegmentedLinks
          legend={t("whoLabel")}
          options={[
            { value: "mine", label: t("mine"), href: calendarHref({ ...state, who: "mine" }) },
            { value: "all", label: t("everyone"), href: calendarHref({ ...state, who: "all" }) },
          ]}
          current={state.who}
        />
        <SegmentedLinks
          legend={t("viewLabel")}
          options={[
            {
              value: "agenda",
              label: t("agendaView"),
              href: calendarHref({ ...state, view: "agenda" }),
            },
            {
              value: "month",
              // "Grid", not "Month": the range control next to it already
              // offers Week and Month, and two neighbouring controls both
              // saying "Month" is a question nobody should have to work out.
              label: t("monthView"),
              href: calendarHref({ ...state, view: "month" }),
            },
          ]}
          current={state.view}
        />
      </div>
    </div>
  );
}

function ArrowLink({
  href,
  label,
  direction,
}: {
  href: string;
  label: string;
  direction: "back" | "forward";
}) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "text-fg-muted hover:text-fg-default hover:bg-surface-hover rounded-control p-1.5",
        focusRing,
        transition,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </Link>
  );
}

/**
 * A row of links that behaves like a set of choices.
 *
 * Links rather than buttons, because each one is a place you can bookmark.
 * `aria-current` carries the selection, and the selected one is also heavier
 * and on a different ground -- three signals, not colour alone.
 */
function SegmentedLinks({
  legend,
  options,
  current,
}: {
  legend: string;
  options: Array<{ value: string; label: string; href: string }>;
  current: string;
}) {
  return (
    <div
      role="group"
      aria-label={legend}
      className="border-border bg-surface-sunken flex items-center gap-0.5 rounded-control border p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "text-label rounded-[6px] px-2.5 py-1",
              focusRing,
              transition,
              selected
                ? "bg-surface-raised text-fg-default font-semibold"
                : "text-fg-muted hover:text-fg-default",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
