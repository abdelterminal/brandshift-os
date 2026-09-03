import { CalendarPlus } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Agenda } from "@/components/calendar/agenda";
import {
  CalendarControls,
  gridBoundsFor,
  windowFor,
  type CalendarRange,
  type CalendarState,
  type CalendarView,
  type CalendarWho,
} from "@/components/calendar/controls";
import { MonthGrid } from "@/components/calendar/month-grid";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { addDays, dayKey, startOfMonth, startOfWeek } from "@/lib/calendar-dates";
import { readAgenda } from "@/lib/data/calendar";

/**
 * The calendar.
 *
 * An agenda by default, a month grid when asked. A list answers "what have I
 * got on" and a grid answers "what shape is my month"; people arrive with the
 * first question, so the list is what they land on -- the same call as lists
 * before boards, for the same reason.
 *
 * Everything here is real: meetings from `meetings`, deadlines read off the
 * tasks and projects that own them. Nothing on this screen is a copy that has
 * to be kept in step with the thing it stands for.
 */

export const dynamic = "force-dynamic";

/** A day the URL supplied, if it is one, rather than whatever was typed. */
function parseDay(value: unknown, fallback: string): string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    ? value
    : fallback;
}

function parseOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export default async function CalendarPage({ searchParams }: PageProps<"/[locale]/calendar">) {
  const session = await requirePermission("calendar.view");
  const params = await searchParams;

  const timeZone = session.organization.timezone;
  const today = dayKey(new Date(), timeZone);

  const range = parseOne<CalendarRange>(params.range, ["week", "month"], "week");
  const view = parseOne<CalendarView>(params.view, ["agenda", "month"], "agenda");
  const who = parseOne<CalendarWho>(params.who, ["mine", "all"], "mine");

  // A week always starts on its Monday and a month on its 1st, whatever day
  // the URL names. Without this, paging forward from a Wednesday gives you a
  // "week" running Wednesday to Tuesday, and the same day appears twice.
  const anchor = parseDay(params.from, today);
  const from = range === "week" ? startOfWeek(anchor) : startOfMonth(anchor);

  const state: CalendarState = { from, range, view, who };
  const bounds = windowFor(state);

  // The grid draws whole weeks, so it needs the days either side of the month
  // as well. The agenda wants exactly what it was asked for.
  const fetched = view === "month" ? gridBoundsFor(bounds) : bounds;

  const [t, format, days] = await Promise.all([
    getTranslations("Calendar"),
    getFormatter(),
    readAgenda(session.actor, {
      from: fetched.from,
      to: fetched.to,
      timeZone,
      mineOnly: who === "mine",
    }),
  ]);

  // Midday, so a formatter rendering in some other zone cannot slide the label
  // onto the day before.
  const at = (day: string) => new Date(`${day}T12:00:00Z`);

  const label =
    range === "week"
      ? `${format.dateTime(at(bounds.from), { day: "numeric", month: "short" })} – ${format.dateTime(
          at(addDays(bounds.to, -1)),
          { day: "numeric", month: "short", year: "numeric" },
        )}`
      : format.dateTime(at(bounds.from), { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
            <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
          </div>

          <Button variant="primary" render={<Link href="/calendar/new" />}>
            <CalendarPlus aria-hidden className="size-4" />
            {t("schedule")}
          </Button>
        </div>
      </header>

      <div className="mb-5">
        <CalendarControls state={state} today={today} label={label} />
      </div>

      {view === "agenda" ? (
        <Agenda days={days} today={today} timeZone={timeZone} mineOnly={who === "mine"} />
      ) : (
        <MonthGrid
          days={days}
          from={bounds.from}
          to={bounds.to}
          today={today}
          timeZone={timeZone}
        />
      )}
    </div>
  );
}
