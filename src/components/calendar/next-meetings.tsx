import { CalendarClock, MapPin } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import type { MeetingWithAttendees } from "@/lib/data/meetings";
import { cn } from "@/lib/utils";

/**
 * What is in your diary next.
 *
 * On Today, because "am I about to be in a meeting" is a question people ask
 * of their day rather than of a calendar, and going to look is the step that
 * makes them late.
 *
 * A week's horizon and at most three. Beyond that it is the calendar's job,
 * and a panel that tries to be the calendar is a panel nobody reads.
 */
export async function NextMeetings({
  meetings,
  timeZone,
  today,
}: {
  meetings: MeetingWithAttendees[];
  timeZone: string;
  /** `YYYY-MM-DD` in the organization's zone, for marking what is today. */
  today: string;
}) {
  const [t, format] = await Promise.all([getTranslations("Meeting"), getFormatter()]);

  if (meetings.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-label text-fg-default font-semibold">{t("nextUp")}</h2>
        <Button variant="link" size="sm" render={<Link href="/calendar" />}>
          {t("viewAll")}
        </Button>
      </div>

      <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
        {meetings.map((meeting) => {
          const isToday =
            new Intl.DateTimeFormat("en-CA", {
              timeZone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(meeting.startsAt) === today;

          return (
            <li key={meeting.id}>
              <Link
                href={`/calendar/${meeting.id}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  "hover:bg-surface-hover",
                  focusRingInset,
                  transition,
                )}
              >
                <CalendarClock aria-hidden className="text-fg-subtle size-4 shrink-0" />

                <span className="min-w-0 flex-1">
                  <span className="text-body text-fg-default block font-medium">
                    {meeting.title}
                  </span>
                  <span className="text-caption text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span className="tabular-nums">
                      {format.dateTime(meeting.startsAt, {
                        weekday: isToday ? undefined : "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone,
                      })}
                    </span>
                    {meeting.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin aria-hidden className="size-3" />
                        {meeting.location}
                      </span>
                    ) : null}
                  </span>
                </span>

                {/*
                  Only an unanswered invitation gets a badge. "Accepted" on
                  every row is a column of noise; "no reply yet" is a thing to
                  do, which is what this screen is for.
                */}
                {meeting.myResponse === "needs_action" ? (
                  <Badge tone="attention" size="sm" className="shrink-0">
                    {t("awaitingReply")}
                  </Badge>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
