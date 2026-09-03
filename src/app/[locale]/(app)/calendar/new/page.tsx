import { getTranslations } from "next-intl/server";

import { ScheduleForm } from "@/components/calendar/schedule-form";
import { requirePermission } from "@/lib/auth/guards";
import { localFromInstant } from "@/lib/calendar-dates";
import { listPeople } from "@/lib/data/people";
import { listProjects } from "@/lib/data/projects";

/**
 * Scheduling a meeting.
 *
 * A routed page rather than a dialog, so a half-filled invitation survives a
 * misclick and the URL can carry a project in from somewhere else. The rule is
 * the same one that put project detail on a page: anything you can spend two
 * minutes filling in does not belong in something a stray Escape closes.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Meeting");
  return { title: t("newTitle") };
}

export default async function NewMeetingPage({
  searchParams,
}: PageProps<"/[locale]/calendar/new">) {
  const session = await requirePermission("meeting.schedule");
  const params = await searchParams;

  const [t, people, projects] = await Promise.all([
    getTranslations("Meeting"),
    // One page big enough to hold the whole organization: this is a guest list,
    // and a picker that silently stops at 25 people is one that cannot invite
    // the 26th.
    listPeople(session.actor, { pageSize: 100 }),
    listProjects(session.actor),
  ]);

  const timeZone = session.organization.timezone;

  // The next round hour, in the organization's clock. A form that opens on
  // "now" asks people to fix the minutes before they can do anything else.
  const now = new Date();
  const nextHour = new Date(now.getTime() + 3_600_000);
  nextHour.setMinutes(0, 0, 0);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-display font-display text-fg-default">{t("newTitle")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("newSubtitle")}</p>
      </header>

      <ScheduleForm
        // Yourself excluded. The organizer is always an attendee, so a
        // checkbox beside your own name is a question with one answer.
        people={people.rows
          .filter((person) => person.userId !== session.actor.userId)
          .map((person) => ({
            userId: person.userId,
            name: person.name,
            avatarUrl: person.avatarUrl,
          }))}
        projects={projects.map((project) => ({
          id: project.id,
          key: project.key,
          name: project.name,
        }))}
        timeZone={timeZone}
        defaultStart={localFromInstant(nextHour, timeZone)}
        defaultProjectId={typeof params.project === "string" ? params.project : undefined}
      />
    </div>
  );
}
