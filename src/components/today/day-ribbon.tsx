/**
 * The day as one bar: what is booked, what is not, and where you are in it.
 *
 * The question this answers is the one somebody asks before picking anything
 * up -- "have I got two hours, or twenty minutes?" -- and it is the question a
 * list of meeting times makes you work out for yourself.
 *
 * Every block is positioned from a real `startsAt`/`endsAt`. Nothing here is
 * drawn unless it is on the calendar.
 */

/**
 * The studio's hours, given by the owner: 09:00-18:00, lunch 13:00-14:00.
 *
 * The one hard-coded assumption in this component, and it is a tenant's
 * working day sitting in a multi-tenant app -- fine for Mediast, wrong for the
 * next organization. `KNOWN-GAPS.md` carries the row for turning it into an
 * organization setting; `organizationToday()`'s default timezone in
 * `src/lib/data/tasks.ts` is the same kind of pragmatic constant.
 */
const DAY_START_MINUTES = 9 * 60;
const DAY_END_MINUTES = 18 * 60;
const LUNCH_START_MINUTES = 13 * 60;
const LUNCH_END_MINUTES = 14 * 60;

const SPAN = DAY_END_MINUTES - DAY_START_MINUTES;

export type RibbonMeeting = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
};

/** Minutes past midnight, read in the organization's timezone rather than the server's. */
function minutesInDay(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Where a minute sits on the bar, clamped to the working day at both ends. */
function percent(minutes: number): number {
  return ((Math.min(DAY_END_MINUTES, Math.max(DAY_START_MINUTES, minutes)) - DAY_START_MINUTES) / SPAN) * 100;
}

export function DayRibbon({
  meetings,
  now,
  timeZone,
  lunchLabel,
  emptyLabel,
}: {
  /** Today's meetings only -- the caller filters, since it holds the day key. */
  meetings: RibbonMeeting[];
  now: Date;
  timeZone: string;
  lunchLabel: string;
  /** Shown instead of the bar when the calendar is clear. */
  emptyLabel: string;
}) {
  if (meetings.length === 0) {
    return <p className="text-caption text-fg-muted">{emptyLabel}</p>;
  }

  const nowMinutes = minutesInDay(now, timeZone);
  const nowVisible = nowMinutes >= DAY_START_MINUTES && nowMinutes <= DAY_END_MINUTES;

  const blocks = meetings.map((meeting) => {
    const from = percent(minutesInDay(meeting.startsAt, timeZone));
    const to = percent(minutesInDay(meeting.endsAt, timeZone));
    return { id: meeting.id, title: meeting.title, from, width: Math.max(to - from, 1.5) };
  });

  const lunchFrom = percent(LUNCH_START_MINUTES);
  const lunchWidth = percent(LUNCH_END_MINUTES) - lunchFrom;

  const spoken = meetings
    .map((meeting) => {
      const time = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone,
      }).format(meeting.startsAt);
      return `${time} ${meeting.title}`;
    })
    .join(", ");

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={spoken}
        className="bg-surface-inset relative h-7 overflow-hidden rounded-control"
      >
        {/* Lunch first, so a meeting booked over it still reads on top. */}
        <span
          aria-hidden
          style={{ "--from": `${lunchFrom}%`, "--width": `${lunchWidth}%` } as React.CSSProperties}
          className="bg-surface-sunken absolute inset-y-0 left-[var(--from)] flex w-[var(--width)] items-center justify-center"
        >
          <span className="text-caption text-fg-subtle truncate px-1">{lunchLabel}</span>
        </span>

        {/* No titles in the blocks. A 45-minute meeting is about 30px of a
            nine-hour bar, which fits roughly two characters -- the bar answers
            "how much clear time is left", and the meeting list beside it
            answers "what are they". The whole bar carries one label for
            anyone reading it aloud. */}
        {blocks.map((block) => (
          <span
            key={block.id}
            aria-hidden
            // A filled block, not a bordered one: no coloured edges anywhere
            // on this page.
            style={{ "--from": `${block.from}%`, "--width": `${block.width}%` } as React.CSSProperties}
            className="bg-active-solid absolute inset-y-1 left-[var(--from)] w-[var(--width)] rounded-[4px]"
          />
        ))}

        {nowVisible ? (
          <span
            aria-hidden
            style={{ "--at": `${percent(nowMinutes)}%` } as React.CSSProperties}
            className="bg-brand absolute inset-y-0 left-[var(--at)] w-0.5"
          />
        ) : null}
      </div>

      <div className="text-caption text-fg-subtle flex justify-between tabular-nums">
        <span>09:00</span>
        <span>12:00</span>
        <span>15:00</span>
        <span>18:00</span>
      </div>
    </div>
  );
}
