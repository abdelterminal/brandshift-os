import { CalendarPlus } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import type { MeetingWithAttendees } from "@/lib/data/meetings";
import { shortLocation } from "@/lib/meeting-location";
import { cn } from "@/lib/utils";

/**
 * A project's meetings, on the project.
 *
 * Newest first, past ones included: the write-up of a decision taken three
 * weeks ago is often exactly what somebody opening a project is looking for,
 * and a list that only shows what is still ahead throws that away.
 *
 * The button carries the project with it, so scheduling from here does not ask
 * you to pick the project you are already looking at.
 */
export async function ProjectMeetings({
  meetings,
  projectId,
  timeZone,
}: {
  meetings: MeetingWithAttendees[];
  projectId: string;
  timeZone: string;
}) {
  const [t, calendar, format] = await Promise.all([
    getTranslations("Meeting"),
    getTranslations("Calendar"),
    getFormatter(),
  ]);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-label text-fg-default font-semibold">{t("onCalendar")}</h2>
        <Button size="sm" render={<Link href={`/calendar/new?project=${projectId}`} />}>
          <CalendarPlus aria-hidden className="size-4" />
          {calendar("schedule")}
        </Button>
      </div>

      {meetings.length === 0 ? (
        <p className="text-body text-fg-muted">{t("noneUpcoming")}</p>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
          {meetings.map((meeting) => {
            const cancelled = meeting.cancelledAt !== null;

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
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "text-body text-fg-default block font-medium",
                        cancelled && "text-fg-muted line-through",
                      )}
                    >
                      {meeting.title}
                    </span>
                    <span className="text-caption text-fg-subtle mt-0.5 block tabular-nums">
                      {format.dateTime(meeting.startsAt, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone,
                      })}
                      {shortLocation(meeting.location)
                        ? ` · ${shortLocation(meeting.location)}`
                        : ""}
                    </span>
                  </span>

                  {cancelled ? (
                    <Badge tone="neutral" size="sm" className="shrink-0">
                      {calendar("cancelled")}
                    </Badge>
                  ) : meeting.notes ? (
                    // A meeting with a write-up is the one worth opening.
                    <Badge tone="complete" size="sm" className="shrink-0">
                      {t("notes")}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
