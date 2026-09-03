import { FolderKanban, ListTodo, MapPin } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { AvatarGroup } from "@/components/ui/avatar";
import { Badge, StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import type { AgendaDay, AgendaEntry } from "@/lib/data/calendar";
import { shortLocation } from "@/lib/meeting-location";
import { cn } from "@/lib/utils";

/**
 * The agenda.
 *
 * The default view, because a list answers "what have I got on" and a grid
 * answers "what shape is my month" -- and the first question is the one people
 * arrive with. It is the same call as lists before boards for tasks, for the
 * same reason.
 *
 * Deadlines sit above the meetings on their day. What is due frames the day;
 * it does not happen at a moment in it.
 */
export async function Agenda({
  days,
  today,
  timeZone,
  mineOnly,
}: {
  days: AgendaDay[];
  today: string;
  timeZone: string;
  mineOnly: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations("Calendar"), getFormatter()]);

  if (days.length === 0) {
    return (
      <div className="border-border rounded-card border">
        <EmptyState
          title={mineOnly ? t("emptyMine") : t("empty")}
          description={mineOnly ? t("emptyMineBody") : t("emptyBody")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.day}>
          <h2 className="text-label text-fg-default mb-2 flex items-center gap-2">
            <span className="font-semibold">
              {format.dateTime(new Date(`${day.day}T12:00:00Z`), {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            {day.day === today ? (
              <Badge tone="accent" size="sm">
                {t("today")}
              </Badge>
            ) : null}
          </h2>

          <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
            {day.entries.map((entry) => (
              <li key={`${entry.kind}:${entry.id}`}>
                <AgendaRow entry={entry} timeZone={timeZone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function AgendaRow({ entry, timeZone }: { entry: AgendaEntry; timeZone: string }) {
  const [t, status, format] = await Promise.all([
    getTranslations("Calendar"),
    getTranslations("Status"),
    getFormatter(),
  ]);

  const row = cn(
    "flex w-full items-center gap-3 px-4 py-3",
    "hover:bg-surface-hover",
    focusRingInset,
    transition,
  );

  if (entry.kind === "meeting") {
    const meeting = entry.meeting;
    const cancelled = meeting.cancelledAt !== null;

    return (
      <Link href={`/calendar/${meeting.id}`} className={row}>
        <span className="w-24 shrink-0 sm:w-28">
          <span
            className={cn(
              "text-label text-fg-default block font-medium tabular-nums",
              cancelled && "line-through",
            )}
          >
            {format.dateTime(meeting.startsAt, { hour: "2-digit", minute: "2-digit", timeZone })}
          </span>
          <span className="text-caption text-fg-subtle block tabular-nums">
            {format.dateTime(meeting.endsAt, { hour: "2-digit", minute: "2-digit", timeZone })}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "text-body text-fg-default block font-medium",
              cancelled && "text-fg-muted line-through",
            )}
          >
            {meeting.title}
          </span>
          <span className="text-caption text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-2">
            {meeting.projectKey ? <span>{meeting.projectKey}</span> : null}
            {/*
              The host, not the whole address. A meeting URL is forty
              characters of noise on a row whose job is to say which tool it
              is; the meeting's own page has the full link, and it is clickable
              there.
            */}
            {shortLocation(meeting.location) ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3" />
                {shortLocation(meeting.location)}
              </span>
            ) : null}
          </span>
        </span>

        {meeting.attendees.length > 0 ? (
          <AvatarGroup
            people={meeting.attendees.map((person) => ({
              name: person.name,
              src: person.avatarUrl,
            }))}
            max={3}
            // Left at the default size on purpose: `AvatarGroup` documents
            // that the overlap eats into the second initial at `sm`, which
            // makes a row of teammates unreadable at exactly the size it is
            // meant for.
            className="hidden shrink-0 sm:flex"
          />
        ) : null}

        {/*
          Said in words as well as struck through. A line through text is not
          something a screen reader announces, and "this is off" is exactly the
          fact somebody must not miss.
        */}
        {cancelled ? (
          <Badge tone="neutral" size="sm" className="shrink-0">
            {t("cancelled")}
          </Badge>
        ) : null}
      </Link>
    );
  }

  if (entry.kind === "task") {
    return (
      <Link href={`/work/${entry.projectKey ?? ""}?task=${entry.id}`} className={row}>
        <span className="text-caption text-fg-subtle w-24 shrink-0 sm:w-28">{t("taskDue")}</span>

        <span className="min-w-0 flex-1">
          <span className="text-body text-fg-default block">{entry.title}</span>
          <span className="text-caption text-fg-subtle mt-0.5 block">
            {[entry.projectKey, entry.assigneeName].filter(Boolean).join(" · ")}
          </span>
        </span>

        {/*
          The word, not an icon on its own. A red dot beside a deadline could
          mean anything; "Blocked" is the one thing on this row somebody has to
          act on, and it is also the only thing a screen reader can read out.
        */}
        {entry.status === "blocked" ? (
          <StatusPill tone="blocked" className="shrink-0">
            {status("blocked")}
          </StatusPill>
        ) : (
          <ListTodo aria-hidden className="text-fg-subtle size-4 shrink-0" />
        )}
      </Link>
    );
  }

  return (
    <Link href={`/work/${entry.key}`} className={row}>
      <span className="text-caption text-fg-subtle w-24 shrink-0 sm:w-28">{t("projectDue")}</span>

      <span className="min-w-0 flex-1">
        <span className="text-body text-fg-default block">{entry.name}</span>
        <span className="text-caption text-fg-subtle mt-0.5 block">{entry.key}</span>
      </span>

      <FolderKanban aria-hidden className="text-fg-subtle size-4 shrink-0" />
    </Link>
  );
}
