import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { NextMeetings } from "@/components/calendar/next-meetings";
import { NewTaskDialog } from "@/components/work/new-task-dialog";
import { TaskListFlat } from "@/components/work/task-list";
import { UnplannedBanner } from "@/components/work/unplanned-banner";
import { UnplannedList } from "@/components/work/unplanned-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Link } from "@/i18n/navigation";
import { atLeast } from "@/lib/authz";
import { listWorkableProjectIds } from "@/lib/data/project-access";
import { requireUser } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { nextMeetingsFor } from "@/lib/data/meetings";
import { listAssignablePeople } from "@/lib/data/people";
import { listUnplannedMembers, planningGraceHours } from "@/lib/data/planning";
import {
  coordinationQueue,
  listTaskBuckets,
  organizationToday,
  type TaskRow,
} from "@/lib/data/tasks";

/**
 * Today.
 *
 * Action-first, and shaped by what the person actually does. A coordinator
 * needs to know what has stopped; someone doing the work needs to know what to
 * pick up next. Those are different questions, so they get different screens
 * rather than one screen with things hidden.
 *
 * Nothing here is a vanity total. Every number is a count of rows someone can
 * click through to and act on.
 */
export default async function TodayPage() {
  const session = await requireUser();

  return atLeast(session.actor, "manager") ? (
    <CoordinationQueue />
  ) : (
    <MyDay name={session.user.name} />
  );
}

/* -------------------------------------------------------------------------- */

async function CoordinationQueue() {
  const session = await requireUser();
  const [t, queue, meetings, assignablePeople, unplannedAll, graceHours] = await Promise.all([
    getTranslations("Today"),
    coordinationQueue(session.actor),
    nextMeetingsFor(session.actor, new Date()),
    listAssignablePeople(session.actor),
    listUnplannedMembers(session.actor),
    planningGraceHours(session.actor),
  ]);
  const viewer = { userId: session.actor.userId, isManager: atLeast(session.actor, "manager"), projectIds: await listWorkableProjectIds(session.actor) };
  const todayIso = organizationToday();

  // Only once they are past the grace period -- inside it, it is between the
  // member and their own project page, not yet the coordinator's problem.
  const unplanned = unplannedAll.filter((row) => row.hoursSince >= graceHours);

  const nothingToDo =
    queue.blocked.length === 0 &&
    queue.overdue.length === 0 &&
    queue.unassigned.length === 0 &&
    unplanned.length === 0;

  const columns = [
    { key: "blocked" as const, tasks: queue.blocked, tone: "blocked" as const },
    { key: "overdue" as const, tasks: queue.overdue, tone: "attention" as const },
    { key: "unassigned" as const, tasks: queue.unassigned, tone: "neutral" as const },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header>
        <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("queueBody")}</p>
      </header>

      {/* Above the queue: a meeting in twenty minutes changes what you start. */}
      <div className="mt-6">
        <NextMeetings
          meetings={meetings}
          timeZone={session.organization.timezone}
          today={dayKey(new Date(), session.organization.timezone)}
        />
      </div>

      {nothingToDo ? (
        <div className="border-border rounded-card mt-6 border">
          <EmptyState title={t("allClear")} description={t("allClearBody")} />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {columns.map((column) => (
            <Card key={column.key} className="min-w-0">
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    {t(column.key)}
                    <CountBadge tone={column.tasks.length > 0 ? column.tone : "neutral"}>
                      {column.tasks.length}
                    </CountBadge>
                  </CardTitle>
                  <p className="text-caption text-fg-muted mt-1">{t(`${column.key}Body`)}</p>
                </div>
              </CardHeader>
              <CardContent className="px-0 pt-1 pb-2">
                {/* An empty column stays true, but doesn't out-weigh the
                    ones with something in them: a full-height EmptyState
                    here reads as a fourth thing to look at on a day where
                    it's actually the two columns beside it that matter. */}
                {column.tasks.length === 0 ? (
                  <div className="flex items-center gap-2 px-4 py-2">
                    <Check aria-hidden className="text-fg-subtle size-3.5 shrink-0" />
                    <p className="text-caption text-fg-subtle">{t(`${column.key}Empty`)}</p>
                  </div>
                ) : (
                  <TaskListFlat
                    tasks={column.tasks}
                    emptyTitle={t("allClear")}
                    emptyBody={t(`${column.key}Body`)}
                    max={8}
                    todayIso={todayIso}
                    assignablePeople={assignablePeople}
                    viewer={viewer}
                  />
                )}
              </CardContent>
              {column.tasks.length > 8 ? (
                <div className="border-border border-t px-4 py-2.5">
                  <Button
                    variant="link"
                    render={<Link href={`/work/queue?bucket=${column.key}`} />}
                  >
                    {t("viewAll")}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}

          <Card className="min-w-0">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  {t("noPlan")}
                  <CountBadge tone={unplanned.length > 0 ? "attention" : "neutral"}>
                    {unplanned.length}
                  </CountBadge>
                </CardTitle>
                <p className="text-caption text-fg-muted mt-1">{t("noPlanBody")}</p>
              </div>
            </CardHeader>
            <CardContent className="px-0 pt-1 pb-2">
              {unplanned.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-2">
                  <Check aria-hidden className="text-fg-subtle size-3.5 shrink-0" />
                  <p className="text-caption text-fg-subtle">{t("noPlanEmpty")}</p>
                </div>
              ) : (
                <UnplannedList items={unplanned.slice(0, 8)} />
              )}
            </CardContent>
            {unplanned.length > 8 ? (
              <div className="border-border border-t px-4 py-2.5">
                <Button variant="link" render={<Link href="/work/queue?bucket=noPlan" />}>
                  {t("viewAll")}
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

async function MyDay({ name }: { name: string }) {
  const session = await requireUser();
  const [t, tWork, buckets, meetings, assignablePeople, myUnplanned, graceHours] = await Promise.all([
    getTranslations("Today"),
    getTranslations("Work"),
    listTaskBuckets(session.actor, { assigneeUserId: session.actor.userId }),
    nextMeetingsFor(session.actor, new Date()),
    listAssignablePeople(session.actor),
    listUnplannedMembers(session.actor, { onlyUserId: session.actor.userId }),
    planningGraceHours(session.actor),
  ]);
  const viewer = { userId: session.actor.userId, isManager: atLeast(session.actor, "manager"), projectIds: await listWorkableProjectIds(session.actor) };

  // Now is what is late or due today; Next is the rest of the week; Later is
  // everything else. Three horizons, so the first one is short enough to act on.
  const now = [...buckets.overdue, ...buckets.today];
  const todayIso = organizationToday();
  const weekEnd = new Date(`${todayIso}T00:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = weekEnd.toISOString().slice(0, 10);

  const next = buckets.upcoming.filter((task) => (task.dueDate ?? "") <= weekEndIso);
  const later = [
    ...buckets.upcoming.filter((task) => (task.dueDate ?? "") > weekEndIso),
    ...buckets.noDeadline,
  ];

  const nextTask = now[0] ?? next[0] ?? later[0] ?? null;
  const hasAnyWork = now.length + next.length + later.length > 0;

  const sections = [
    { key: "now" as const, tasks: now },
    { key: "next" as const, tasks: next },
    { key: "later" as const, tasks: later },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">
            {t("greeting", { name: name.split(" ")[0] ?? name })}
          </p>
        </div>
        {/* No project: a personal to-do, always the creator's own. */}
        <NewTaskDialog projectId={null} assignablePeople={[]} currentUserId={session.actor.userId} />
      </header>

      {/*
        Before the work, not after it. Somebody with a call in twenty minutes
        should not start the two-hour task, and finding that out at the bottom
        of the page is finding it out too late.
      */}
      <div className="mt-6">
        <NextMeetings
          meetings={meetings}
          timeZone={session.organization.timezone}
          today={dayKey(new Date(), session.organization.timezone)}
        />
      </div>

      {myUnplanned.length > 0 ? (
        <div className="mt-6 flex flex-col gap-2">
          {myUnplanned.map((row) => (
            <Link key={row.projectId} href={`/work/${row.projectKey}`} className="block">
              <p className="text-caption text-fg-muted mb-1">{row.projectName}</p>
              <UnplannedBanner
                title={tWork("noPlanYet")}
                body={tWork("noPlanYetBody")}
                pastGrace={row.hoursSince >= graceHours}
              />
            </Link>
          ))}
        </div>
      ) : null}

      {!hasAnyWork ? (
        <div className="border-border rounded-card mt-6 border">
          <EmptyState title={t("noWork")} description={t("noWorkBody")} />
        </div>
      ) : (
        <>
          {nextTask ? <NextTaskPanel task={nextTask} /> : null}

          <div className="mt-8 flex flex-col gap-6">
            {sections.map((section) => (
              <section key={section.key}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="text-heading font-display text-fg-default">{t(section.key)}</h2>
                  <span className="text-caption text-fg-subtle tabular-nums">
                    {section.tasks.length}
                  </span>
                </div>
                <p className="text-caption text-fg-muted mb-2">{t(`${section.key}Body`)}</p>

                <div className="border-border bg-surface-raised overflow-hidden rounded-card border">
                  <TaskListFlat
                    tasks={section.tasks}
                    emptyTitle={section.key === "now" ? t("nothingToday") : t("noWork")}
                    emptyBody={section.key === "now" ? t("nothingTodayBody") : t("noWorkBody")}
                    todayIso={todayIso}
                    showBlockedReason
                    assignablePeople={assignablePeople}
                    viewer={viewer}
                  />
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The one thing to pick up.
 *
 * A member's Today opens with a single task rather than a list, because the
 * question "what should I do now" has one answer and a list of twelve does not
 * give it.
 */
async function NextTaskPanel({ task }: { task: TaskRow }) {
  const t = await getTranslations("Today");

  return (
    <Card className="border-accent-border bg-accent-subtle mt-6">
      <CardHeader>
        <div className="min-w-0">
          <p className="text-caption text-accent-text">{t("nextTask")}</p>
          <CardTitle className="mt-1 truncate">{task.title}</CardTitle>
          {task.projectName ? (
            <p className="text-caption text-fg-muted mt-1">
              {task.projectKey} · {task.projectName}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-caption text-fg-muted">{t("nextTaskBody")}</p>
      </CardContent>
    </Card>
  );
}
