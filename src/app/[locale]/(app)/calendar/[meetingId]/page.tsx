import { CalendarClock, MapPin } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  MeetingNotes,
  OrganizerControls,
  RespondButtons,
  type Response,
} from "@/components/calendar/meeting-controls";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { focusRing, quietLinkHover, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { localFromInstant } from "@/lib/calendar-dates";
import { getMeeting, type MeetingResponse } from "@/lib/data/meetings";
import { readLocation } from "@/lib/meeting-location";
import { cn } from "@/lib/utils";

/**
 * One meeting.
 *
 * A routed page under the calendar, so the URL and the breadcrumb agree and a
 * meeting is something you can send someone rather than something you have to
 * describe how to reach.
 *
 * The order is what somebody arriving actually needs: when and where, then who
 * is coming, then what it is for, then what was decided. Your own answer sits
 * near the top, because for most people opening this that is the whole errand.
 */

export const dynamic = "force-dynamic";

const RESPONSE_TONE: Record<MeetingResponse, "complete" | "blocked" | "attention" | "neutral"> = {
  accepted: "complete",
  declined: "blocked",
  tentative: "attention",
  needs_action: "neutral",
};

export async function generateMetadata({ params }: PageProps<"/[locale]/calendar/[meetingId]">) {
  const session = await requirePermission("calendar.view");
  const { meetingId } = await params;
  const meeting = await getMeeting(session.actor, meetingId);
  return { title: meeting?.title ?? "" };
}

export default async function MeetingPage({ params }: PageProps<"/[locale]/calendar/[meetingId]">) {
  const session = await requirePermission("calendar.view");
  const { meetingId } = await params;

  const meeting = await getMeeting(session.actor, meetingId);
  if (!meeting) notFound();

  const [t, format] = await Promise.all([getTranslations("Meeting"), getFormatter()]);

  const timeZone = session.organization.timezone;
  const cancelled = meeting.cancelledAt !== null;
  const canManage = can(session.actor, "meeting.manage", meeting);
  const invited = meeting.myResponse !== null;
  const attended = invited || meeting.organizerUserId === session.actor.userId;

  // A room is text; a video call is a link you can actually press. Only http
  // and https become links -- the location is typed by a person, and this is
  // the field that ends up in an `href`.
  const where = readLocation(meeting.location);

  const responseLabel: Record<MeetingResponse, string> = {
    accepted: t("going"),
    declined: t("notGoing"),
    tentative: t("maybe"),
    needs_action: t("awaitingReply"),
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display font-display text-fg-default">{meeting.title}</h1>
            {cancelled ? (
              // Said in words, at the top, before anything else on the page.
              // Everything below it is about a meeting that is not happening.
              <p role="status" className="text-body text-blocked-text mt-2 font-medium">
                {t("cancelled")}
              </p>
            ) : null}
          </div>

          {canManage && !cancelled ? (
            <OrganizerControls
              meetingId={meeting.id}
              startsLocal={localFromInstant(meeting.startsAt, timeZone)}
              durationMinutes={Math.round(
                (meeting.endsAt.getTime() - meeting.startsAt.getTime()) / 60_000,
              )}
              timeZone={timeZone}
            />
          ) : null}
        </div>
      </header>

      <dl className="border-border bg-surface-raised grid gap-4 rounded-card border p-4 sm:grid-cols-2">
        <div>
          <dt className="text-caption text-fg-muted">{t("when")}</dt>
          <dd className="text-body text-fg-default mt-0.5 flex items-start gap-2">
            <CalendarClock aria-hidden className="text-fg-subtle mt-0.5 size-4 shrink-0" />
            <span>
              {format.dateTime(meeting.startsAt, {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
                timeZone,
              })}
              {" – "}
              {format.dateTime(meeting.endsAt, {
                hour: "2-digit",
                minute: "2-digit",
                timeZone,
              })}
            </span>
          </dd>
        </div>

        {where ? (
          <div>
            <dt className="text-caption text-fg-muted">{t("where")}</dt>
            <dd className="text-body text-fg-default mt-0.5 flex items-start gap-2">
              <MapPin aria-hidden className="text-fg-subtle mt-0.5 size-4 shrink-0" />
              {where.kind === "link" ? (
                <a
                  href={where.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(
                    "text-fg-default rounded-[6px] break-all underline underline-offset-2",
                    quietLinkHover,
                    focusRing,
                    transition,
                  )}
                >
                  {where.href}
                </a>
              ) : (
                <span className="break-words">{where.text}</span>
              )}
            </dd>
          </div>
        ) : null}

        <div>
          <dt className="text-caption text-fg-muted">{t("organizer")}</dt>
          <dd className="text-body text-fg-default mt-0.5 flex items-center gap-2">
            <PersonAvatar name={meeting.organizerName ?? "?"} size="xs" />
            {meeting.organizerName}
          </dd>
        </div>

        {meeting.projectKey ? (
          <div>
            <dt className="text-caption text-fg-muted">{t("project")}</dt>
            <dd className="text-body mt-0.5">
              <Link
                href={`/work/${meeting.projectKey}`}
                className={cn(
                  "text-fg-default rounded-[6px] font-medium underline underline-offset-2",
                  quietLinkHover,
                  focusRing,
                  transition,
                )}
              >
                {meeting.projectName ?? meeting.projectKey}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      {invited && !cancelled ? (
        <section className="mt-6">
          <h2 className="text-label text-fg-default mb-2 font-semibold">{t("yourReply")}</h2>
          <RespondButtons
            meetingId={meeting.id}
            current={(meeting.myResponse ?? "needs_action") as Response | "needs_action"}
          />
        </section>
      ) : !invited ? (
        <p className="text-body text-fg-muted mt-6">{t("notInvited")}</p>
      ) : null}

      <section className="mt-6">
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("attendees")}</h2>
        <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
          {meeting.attendees.map((person) => (
            <li key={person.userId} className="flex items-center gap-3 px-4 py-2.5">
              <PersonAvatar name={person.name} src={person.avatarUrl} size="sm" />
              <span className="text-body text-fg-default min-w-0 flex-1 truncate">
                {person.name}
              </span>
              <Badge tone={RESPONSE_TONE[person.response]} size="sm" className="shrink-0">
                {responseLabel[person.response]}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("agenda")}</h2>
        {meeting.agenda ? (
          <p className="text-body text-fg-default whitespace-pre-wrap">{meeting.agenda}</p>
        ) : (
          <p className="text-body text-fg-muted">{t("noAgenda")}</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("notes")}</h2>
        <MeetingNotes meetingId={meeting.id} notes={meeting.notes} canWrite={attended} />
      </section>
    </div>
  );
}
