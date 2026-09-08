import { getFormatter, getTranslations } from "next-intl/server";

import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { addDays, startOfWeek } from "@/lib/calendar-dates";
import type { AgendaDay, AgendaEntry } from "@/lib/data/calendar";
import { cn } from "@/lib/utils";

/**
 * The month, as a grid.
 *
 * The secondary view. A grid answers "what shape is my month" -- where the
 * clear runs are, where three things land on one afternoon -- which the agenda
 * cannot show. It does not answer "what have I got on", which is why it is not
 * the default.
 *
 * It scrolls inside its own box below about 640px rather than making the page
 * scroll sideways. Seven columns of readable text do not fit on a phone, and
 * shrinking the text until they do would put meaning below 12px.
 */

/** At most this many entries per cell before the rest become a count. */
const PER_CELL = 3;

export async function MonthGrid({
  days,
  from,
  to,
  today,
  timeZone,
}: {
  days: AgendaDay[];
  /** First day of the month, `YYYY-MM-DD`. */
  from: string;
  /** Exclusive last day. */
  to: string;
  today: string;
  timeZone: string;
}) {
  const t = await getTranslations("Calendar");

  const byDay = new Map(days.map((day) => [day.day, day.entries]));
  const month = from.slice(0, 7);

  // Whole weeks, so the grid is rectangular: the days either side belong to
  // the neighbouring months and are drawn quieter rather than left blank.
  const first = startOfWeek(from);
  const cells: string[] = [];
  for (let day = first; day < to || cells.length % 7 !== 0; day = addDays(day, 1)) {
    cells.push(day);
    if (cells.length > 42) break;
  }

  const weekdays = t("weekdayShort").split(" ");

  return (
    // `relative`, and not decoratively. `sr-only` is `position: absolute`, so
    // without a positioned ancestor those spans are laid out against the
    // viewport instead of this box -- they escape the horizontal clip and
    // stretch the whole document sideways, which is the one thing this
    // container exists to prevent.
    <div role="region" tabIndex={0} aria-label={t("title")} className="border-border relative overflow-x-auto rounded-card border focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2">
      <div className="min-w-[40rem]">
        <div className="border-border bg-surface-sunken grid grid-cols-7 border-b" aria-hidden>
          {weekdays.map((weekday) => (
            <div key={weekday} className="text-caption text-fg-muted px-2 py-1.5 font-medium">
              {weekday}
            </div>
          ))}
        </div>

        <div className="divide-border grid grid-cols-7 divide-x divide-y">
          {cells.map((day) => {
            const entries = byDay.get(day) ?? [];
            const outside = !day.startsWith(month);
            const isToday = day === today;

            return (
              <div
                key={day}
                className={cn(
                  "min-h-24 p-1.5",
                  outside ? "bg-surface-sunken" : "bg-surface-raised",
                )}
              >
                <p
                  className={cn(
                    "text-caption mb-1 tabular-nums",
                    isToday
                      ? "text-accent-text font-semibold"
                      : outside
                        ? "text-fg-subtle"
                        : "text-fg-muted",
                  )}
                >
                  {isToday ? (
                    <span className="bg-accent text-accent-fg rounded-pill px-1.5 py-0.5">
                      {Number(day.slice(8))}
                    </span>
                  ) : (
                    Number(day.slice(8))
                  )}
                </p>

                <ul className="flex flex-col gap-0.5">
                  {entries.slice(0, PER_CELL).map((entry) => (
                    <li key={`${entry.kind}:${entry.id}`}>
                      <MonthEntry entry={entry} timeZone={timeZone} />
                    </li>
                  ))}
                </ul>

                {entries.length > PER_CELL ? (
                  <p className="text-caption text-fg-subtle mt-0.5">
                    {t("moreEntries", { count: entries.length - PER_CELL })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

async function MonthEntry({ entry, timeZone }: { entry: AgendaEntry; timeZone: string }) {
  const [t, format] = await Promise.all([getTranslations("Calendar"), getFormatter()]);

  // Tone carries the kind: blue for a meeting, red for a blocker, amber for a
  // project deadline. Hover darkens the border rather than the ground, because
  // the token set has one background step per tone and inventing a second one
  // inside a component is how a design system stops being the design system.
  const chip = cn(
    "text-caption block truncate rounded-[6px] border px-1 py-0.5",
    focusRingInset,
    transition,
  );

  if (entry.kind === "meeting") {
    const cancelled = entry.meeting.cancelledAt !== null;
    return (
      <Link
        href={`/calendar/${entry.meeting.id}`}
        className={cn(
          chip,
          cancelled
            ? // Not faded. Dimming text that still has to be read is a contrast
              // failure wearing a state, which this codebase has already
              // shipped once. A called-off meeting recedes by losing its tone,
              // not by losing its legibility.
              "bg-surface-sunken text-fg-muted border-border line-through hover:border-border-hover"
            : "bg-active-bg text-active-text border-active-border hover:border-active-solid",
        )}
      >
        {/* A line through text is not something a screen reader announces. */}
        {cancelled ? <span className="sr-only">{t("cancelled")} </span> : null}
        <span className="tabular-nums">
          {format.dateTime(entry.meeting.startsAt, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone,
          })}
        </span>{" "}
        {entry.meeting.title}
      </Link>
    );
  }

  if (entry.kind === "leave") {
    return (
      <span
        className={cn(
          chip,
          "bg-complete-bg text-complete-text border-complete-border cursor-default",
        )}
      >
        {entry.mine ? t("youAreAway") : entry.userName}
      </span>
    );
  }

  if (entry.kind === "task") {
    return (
      <Link
        href={`/work/${entry.projectKey ?? ""}?task=${entry.id}`}
        className={cn(
          chip,
          entry.status === "blocked"
            ? "bg-blocked-bg text-blocked-text border-blocked-border hover:border-blocked-solid"
            : "bg-surface-sunken text-fg-muted border-border hover:border-border-hover",
        )}
      >
        {entry.title}
      </Link>
    );
  }

  return (
    <Link
      href={`/work/${entry.key}`}
      className={cn(
        chip,
        "bg-attention-bg text-attention-text border-attention-border hover:border-attention-solid",
      )}
    >
      {entry.key} · {entry.name}
    </Link>
  );
}
