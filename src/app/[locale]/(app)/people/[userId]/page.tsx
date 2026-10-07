import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/work/activity-feed";
import { PersonTabs } from "@/components/people/person-tabs";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { atLeast, can } from "@/lib/authz";
import { mayActOnTarget } from "@/lib/member-guards";
import { requireUser } from "@/lib/auth/guards";
import { listPersonActivity } from "@/lib/data/activity";
import { getPerson, listAssignablePeople } from "@/lib/data/people";
import { listWorkableProjectIds } from "@/lib/data/project-access";
import { seesOnlyOwnWork } from "@/lib/data/visibility";
import { listProjectsForUser } from "@/lib/data/projects";
import { listTaskBuckets, organizationToday } from "@/lib/data/tasks";

/**
 * A person, as a routed page with tabs.
 *
 * Same shape as a project: Overview, Work, Activity, each linkable. Role and
 * module access are edited here rather than in a dialog, because changing what
 * someone may do is a decision worth a page of its own context.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/people/[userId]">) {
  const session = await requireUser();
  const { userId } = await params;
  const person = await getPerson(session.actor, userId);
  return { title: person?.name ?? "" };
}

export default async function PersonPage({ params }: PageProps<"/[locale]/people/[userId]">) {
  const session = await requireUser();
  const { userId } = await params;

  // A member's page is their own and nobody else's: what another person is
  // working on, and how far along, is not theirs to browse.
  if (seesOnlyOwnWork(session.actor) && userId !== session.actor.userId) notFound();

  const person = await getPerson(session.actor, userId);
  if (!person) notFound();

  const [t, roles, buckets, projects, activity, assignablePeople] = await Promise.all([
    getTranslations("People"),
    getTranslations("Roles"),
    listTaskBuckets(session.actor, { assigneeUserId: userId }),
    listProjectsForUser(session.actor, userId),
    listPersonActivity(session.actor, userId),
    listAssignablePeople(session.actor),
  ]);
  const viewer = { userId: session.actor.userId, isManager: atLeast(session.actor, "manager"), projectIds: await listWorkableProjectIds(session.actor) };

  const openCount =
    buckets.overdue.length +
    buckets.today.length +
    buckets.upcoming.length +
    buckets.noDeadline.length;
  const todayIso = organizationToday();

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-start gap-4">
        <PersonAvatar name={person.name} src={person.avatarUrl} size="xl" />

        <div className="min-w-0 flex-1">
          <h1 className="text-display font-display text-fg-default">{person.name}</h1>
          <p className="text-body text-fg-muted mt-1">{person.email}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={person.role === "owner" ? "accent" : "neutral"}>
              {roles(person.role)}
            </Badge>
            {person.jobTitle ? <Badge>{person.jobTitle}</Badge> : null}
            {person.departmentName ? <Badge>{person.departmentName}</Badge> : null}
            {person.status === "invited" ? (
              <Badge tone="attention">{t("pending")}</Badge>
            ) : null}
            {/*
              Suspension is the one status that changes what this person can
              do, so it is stated on the header rather than only inside the
              admin card -- otherwise the page reads as a working account.
            */}
            {person.status === "suspended" ? (
              <Badge tone="blocked">{t("suspendedBadge")}</Badge>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-8">
        <PersonTabs
          person={{
            userId: person.userId,
            name: person.name,
            email: person.email,
            role: person.role,
            permissions: person.permissions,
            departmentId: person.departmentId,
            jobTitle: person.jobTitle,
            suspended: person.status === "suspended",
          }}
          openCount={openCount}
          overdueCount={buckets.overdue.length}
          buckets={buckets}
          todayIso={todayIso}
          assignablePeople={assignablePeople}
          viewer={viewer}
          projects={projects.map((project) => ({
            id: project.id,
            key: project.key,
            name: project.name,
            status: project.status,
          }))}
          // `member.editRole` also covers the password-reset card, and both
          // refuse on an owner when the actor is not one -- so the same target
          // rule applies here as to the three cards below. Before this, an
          // admin was shown Change role and Reset password on an owner's page
          // and the first was refused while the second silently did nothing.
          canEditRole={
            can(session.actor, "member.editRole") &&
            mayActOnTarget(person.role, session.actor.role)
          }
          // Two questions, both asked here and passed down as plain booleans.
          // `can()` answers "may this actor do this at all"; `mayActOnTarget`
          // answers "may they do it to *this* person" -- an admin may suspend
          // people in general and still not an owner. Both have to hold, or the
          // page would offer a control the action then refuses, which is the
          // one thing `authz.ts` exists to prevent. Each action re-checks both
          // server-side; this only decides what is worth showing.
          admin={{
            editProfile: can(session.actor, "member.editProfile") && mayActOnTarget(person.role, session.actor.role),
            changeEmail: can(session.actor, "member.changeEmail") && mayActOnTarget(person.role, session.actor.role),
            suspend: can(session.actor, "member.suspend") && mayActOnTarget(person.role, session.actor.role),
          }}
          isSelf={session.actor.userId === person.userId}
          activity={<ActivityFeed events={activity} />}
        />
      </div>
    </div>
  );
}
