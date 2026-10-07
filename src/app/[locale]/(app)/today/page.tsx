import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { NextMeetings } from "@/components/calendar/next-meetings";
import { MyDay, MyDeliverables } from "@/components/today/my-day";
import { PressureBar } from "@/components/today/pressure-bar";
import { QueueLaneHeader } from "@/components/work/queue-lane-header";
import { ResizableQueueColumns } from "@/components/work/resizable-queue-columns";
import { TaskListFlat } from "@/components/work/task-list";
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
import { listMyDeliverables } from "@/lib/data/deliverables";
import { nextMeetingsFor } from "@/lib/data/meetings";
import { listAssignablePeople } from "@/lib/data/people";
import { listUnplannedMembers, planningGraceHours } from "@/lib/data/planning";
import { coordinationQueue, listTaskBuckets, organizationToday } from "@/lib/data/tasks";

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
  const [t, queue, meetings, assignablePeople, unplannedAll, graceHours, myBuckets, myDeliverables] =
    await Promise.all([
      getTranslations("Today"),
      coordinationQueue(session.actor),
      nextMeetingsFor(session.actor, new Date()),
      listAssignablePeople(session.actor),
      listUnplannedMembers(session.actor),
      planningGraceHours(session.actor),
      // Triage is org-wide and about everyone else's work; a manager still
      // does their own, and this page was otherwise the one place that never
      // showed it to them.
      listTaskBuckets(session.actor, { assigneeUserId: session.actor.userId }),
      listMyDeliverables(session.actor),
    ]);
  const viewer = { userId: session.actor.userId, isManager: atLeast(session.actor, "manager"), projectIds: await listWorkableProjectIds(session.actor) };
  const todayIso = organizationToday();
  const mine = [...myBuckets.overdue, ...myBuckets.today];

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

  // What the pressure bar reads out. Counted from the rows already fetched --
  // the same three sets the lanes below render, plus the unplanned people.
  const queueTotal =
    queue.blocked.length + queue.overdue.length + queue.unassigned.length + unplanned.length;
  const queueProjects = new Set(
    [...queue.blocked, ...queue.overdue, ...queue.unassigned]
      .map((task) => task.projectId)
      .filter((id): id is string => id !== null),
  ).size;

  return (
    /* A screen, not a document. The shell already gives this `h-dvh` with the
       overflow on `<main>`, so holding the column to `h-full` and letting only
       the lanes grow is what keeps the page itself off both scrollbars. Full
       width too: `max-w-6xl` left the four lanes about 70px short and was the
       whole reason the row scrolled sideways. */
    <div className="flex h-full min-h-0 flex-col gap-4 px-5 py-6 sm:px-8">
      <header className="shrink-0">
        <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
        <p className="text-body text-fg-muted mt-1">{t("queueBody")}</p>
      </header>

      <div className="shrink-0">
        <PressureBar
          heading={t("queueTitle")}
          summary={t("pressureSummary", { count: queueTotal, projects: queueProjects })}
          segments={[
            {
              key: "blocked",
              label: t("blocked"),
              count: queue.blocked.length,
              href: "/work/queue?bucket=blocked",
              tone: "blocked",
            },
            {
              key: "overdue",
              label: t("overdue"),
              count: queue.overdue.length,
              href: "/work/queue?bucket=overdue",
              tone: "attention",
            },
            {
              key: "unassigned",
              label: t("unassigned"),
              count: queue.unassigned.length,
              href: "/work/queue?bucket=unassigned",
              tone: "neutral",
            },
            {
              key: "noPlan",
              label: t("noPlan"),
              count: unplanned.length,
              href: "/work/queue?bucket=noPlan",
              tone: "attention",
            },
          ]}
        />
      </div>

      {/* Overview zone: what's real right now, grouped as one family rather
          than stacked full-width blocks. The queue below stays a list.
          Bounded so it cannot crowd out the lanes -- each cell scrolls inside
          itself rather than pushing the page taller. */}
      <div className="grid max-h-[32vh] shrink-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-h-0 overflow-y-auto lg:col-span-2">
          <NextMeetings
            meetings={meetings}
            timeZone={session.organization.timezone}
            today={dayKey(new Date(), session.organization.timezone)}
          />
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {/*
            Always rendered, where it used to disappear the moment it was
            empty. A coordinator whose own list is clear needs to be told that
            -- silence reads as "this screen does not do that", which is what
            sent somebody looking for their tasks and finding nothing.

            Still only the late and due-today rows, and still capped: this is a
            corner of a screen about everybody else's work. "All of it" is the
            link, the same shape the lanes below use to reach the uncapped
            queue.
          */}
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  {t("mine")}
                  {mine.length > 0 ? (
                    <CountBadge tone="attention">{mine.length}</CountBadge>
                  ) : null}
                </CardTitle>
                <p className="text-caption text-fg-muted mt-1">{t("mineBody")}</p>
              </div>
              <Button size="sm" render={<Link href="/work/mine" />}>
                {t("allMyWork")}
              </Button>
            </CardHeader>
            <CardContent className="px-0 pt-1 pb-2">
              <TaskListFlat
                tasks={mine}
                emptyTitle={t("mineClear")}
                emptyBody={t("mineClearBody")}
                showAssignee={false}
                max={3}
                todayIso={todayIso}
                assignablePeople={assignablePeople}
                viewer={viewer}
              />
            </CardContent>
          </Card>

          <MyDeliverables items={myDeliverables} />
        </div>
      </div>

      {nothingToDo ? (
        <div className="border-border rounded-card shrink-0 border">
          <EmptyState title={t("allClear")} description={t("allClearBody")} />
        </div>
      ) : (
        /* The lanes take whatever the header, bar and overview leave, and each
           one scrolls its own list rather than growing the page. */
        <div className="min-h-0 flex-1">
          <ResizableQueueColumns storageKey="today-coordination-queue">
            {[
              ...columns.map((column) => ({
                id: column.key,
                title: t(column.key),
                node: (
                  <Card key={column.key} className="w-full min-h-0 flex-1 overflow-hidden">
                    <QueueLaneHeader
                      title={t(column.key)}
                      description={t(`${column.key}Body`)}
                      count={column.tasks.length}
                      tone={column.tone}
                    />
                    <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 pt-2 pb-2">
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
                ),
              })),
              {
                id: "noPlan",
                title: t("noPlan"),
                node: (
                  <Card key="noPlan" className="w-full min-h-0 flex-1 overflow-hidden">
                    <QueueLaneHeader
                      title={t("noPlan")}
                      description={t("noPlanBody")}
                      count={unplanned.length}
                      tone="attention"
                    />
                    <CardContent className="min-h-0 flex-1 overflow-y-auto px-0 pt-2 pb-2">
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
                ),
              },
            ]}
          </ResizableQueueColumns>
        </div>
      )}
    </div>
  );
}
