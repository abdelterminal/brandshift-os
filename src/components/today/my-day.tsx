import { getFormatter, getTranslations } from "next-intl/server";

import { NextMeetings } from "@/components/calendar/next-meetings";
import { DayRibbon } from "@/components/today/day-ribbon";
import { NewTaskDialog } from "@/components/work/new-task-dialog";
import { TaskListFlat } from "@/components/work/task-list";
import { UnplannedBanner } from "@/components/work/unplanned-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountBadge, StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { atLeast } from "@/lib/authz";
import { listWorkableProjectIds } from "@/lib/data/project-access";
import { requireUser } from "@/lib/auth/guards";
import { dayKey, startOfDay } from "@/lib/calendar-dates";
import { listMyDeliverables, type MyDeliverableRow } from "@/lib/data/deliverables";
import { isOverdue } from "@/lib/due-date";
import { listMeetings, nextMeetingsFor } from "@/lib/data/meetings";
import { listAssignablePeople } from "@/lib/data/people";
import { listUnplannedMembers, planningGraceHours } from "@/lib/data/planning";
import { listProjectsForUser } from "@/lib/data/projects";
import { cn } from "@/lib/utils";
import { listTaskBuckets, organizationToday, type TaskRow } from "@/lib/data/tasks";

/**
 * One person's own day: what is on them now, next and later.
 *
 * Lifted out of `today/page.tsx` so two routes can render the same thing.
 * Today gives it to anybody below manager, because it is their whole screen;
 * `/work/mine` gives it to everybody, because a manager's Today is the
 * coordination queue -- somebody else's work -- and they were left with a
 * three-row summary of their own and no way to see the rest.
 *
 * It reads its own session rather than taking one, so a route only has to
 * render it.
 */
/**
 * What an empty bucket says, per bucket -- not one message reused for all
 * three. Reusing "no open work assigned to you" on an empty `next` while
 * `now`/`later` are full told somebody with three open tasks that they had
 * none, which is simply wrong rather than just generic.
 */
const SECTION_EMPTY = {
  now: ["nothingToday", "nothingTodayBody"],
  next: ["nothingNext", "nothingNextBody"],
  later: ["nothingLater", "nothingLaterBody"],
} as const;

/** Same mapping the project's own Deliverables tab uses -- kept local, same as that page's own copy. */
const DELIVERABLE_STATUS_TONE = {
  producing: "neutral",
  internal_review: "active",
  with_client: "active",
  revising: "attention",
  published: "complete",
  cancelled: "neutral",
} as const;

/** Same mapping `/work` uses for its own project list -- kept local, same as that page's own copy. */
const PROJECT_STATUS_TONE = {
  planning: "neutral",
  active: "active",
  on_hold: "attention",
  completed: "complete",
  archived: "neutral",
} as const;

/* -------------------------------------------------------------------------- */

export async function MyDay({
  name,
  heading = "title",
}: {
  name: string;
  /**
   * Which `Today` string titles the screen. Today says "Today"; `/work/mine`
   * says "My work", because the same list under the same word twice would
   * leave somebody unsure which of the two they were looking at -- and one is
   * reached from the other.
   */
  heading?: "title" | "myWorkTitle";
}) {
  const session = await requireUser();

  // Read the clock once and pass the instants down, rather than calling it
  // again inside each argument -- one render should not straddle two times.
  const rightNow = new Date();
  const tomorrow = new Date(rightNow);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    t,
    tWork,
    ui,
    tProjectStatus,
    buckets,
    meetings,
    assignablePeople,
    myUnplanned,
    graceHours,
    myProjectMemberships,
    myDeliverables,
    todayMeetings,
  ] = await Promise.all([
    getTranslations("Today"),
    getTranslations("Work"),
    getTranslations("Ui"),
    getTranslations("ProjectStatus"),
    listTaskBuckets(session.actor, { assigneeUserId: session.actor.userId }),
    nextMeetingsFor(session.actor, rightNow),
    listAssignablePeople(session.actor),
    listUnplannedMembers(session.actor, { onlyUserId: session.actor.userId }),
    planningGraceHours(session.actor),
    listProjectsForUser(session.actor, session.actor.userId),
    listMyDeliverables(session.actor),
    // The ribbon draws the whole working day, so it needs today's meetings
    // whether or not they have already finished. `nextMeetingsFor` only ever
    // returns upcoming ones, which would show a member checking at four
    // o'clock an empty morning they had actually spent in calls.
    listMeetings(session.actor, {
      from: startOfDay(dayKey(rightNow, session.organization.timezone), session.organization.timezone),
      to: startOfDay(dayKey(tomorrow, session.organization.timezone), session.organization.timezone),
      mineOnly: true,
      includeCancelled: false,
    }),
  ]);
  const viewer = { userId: session.actor.userId, isManager: atLeast(session.actor, "manager"), projectIds: await listWorkableProjectIds(session.actor) };
  // The Today dialog's project picker: only projects a lead or contributor
  // is actually on -- a viewer-only membership doesn't earn a "New task"
  // button here any more than it does on the project's own Tasks tab.
  const myProjects = myProjectMemberships
    .filter((project) => viewer.projectIds.includes(project.id))
    .map((project) => ({ id: project.id, key: project.key, name: project.name }));

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

  // Which project each open task belongs to, counted once here rather than
  // queried again -- every one of this member's open tasks is already in
  // `now`/`next`/`later`, so grouping them by `projectId` is free.
  const openByProject = new Map<string, number>();
  const blockedByProject = new Map<string, number>();
  for (const task of [...now, ...next, ...later]) {
    if (!task.projectId) continue;
    openByProject.set(task.projectId, (openByProject.get(task.projectId) ?? 0) + 1);
    if (task.status === "blocked") {
      blockedByProject.set(task.projectId, (blockedByProject.get(task.projectId) ?? 0) + 1);
    }
  }

  const todayKey = dayKey(rightNow, session.organization.timezone);

  return (
    /* A screen, not a document -- the same shape the coordinator view uses, so
       the two halves of Today agree. The shell supplies `h-dvh` with the
       overflow on `<main>`; this column just has to stop being taller. */
    <div className="flex h-full min-h-0 flex-col gap-4 px-5 py-6 sm:px-8">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display font-display text-fg-default">{t(heading)}</h1>
          <p className="text-body text-fg-muted mt-1">
            {t("greeting", { name: name.split(" ")[0] ?? name })}
          </p>
        </div>
        {/* No fixed project here -- a personal to-do by default, or one of
            the member's own projects if they pick one. */}
        <NewTaskDialog
          projectId={null}
          myProjects={myProjects}
          assignablePeople={assignablePeople}
          currentUserId={session.actor.userId}
          isManager={viewer.isManager}
        />
      </header>

      {/*
        Before the work, not after it. Somebody with a call in twenty minutes
        should not start the two-hour task, and finding that out at the bottom
        of the page is finding it out too late.
      */}
      {/* Side by side: the one task to start, and how much room the day
          leaves to start it. Stacked they cost most of the screen before any
          actual work appears -- and the tinted hero, run full width, is far
          more of the page in one colour than it earns. */}
      <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        {hasAnyWork && nextTask ? (
          <NextTaskPanel task={nextTask} todayIso={todayIso} />
        ) : (
          <div />
        )}

        <div className="border-border bg-surface-raised rounded-card flex items-center border p-3">
          <div className="w-full">
            <DayRibbon
              meetings={todayMeetings}
              now={rightNow}
              timeZone={session.organization.timezone}
              lunchLabel={t("lunch")}
              emptyLabel={t("nothingScheduled")}
            />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-4">
        {!hasAnyWork ? (
          <div className="border-border rounded-card border lg:col-span-3">
            <EmptyState title={t("noWork")} description={t("noWorkBody")} />
          </div>
        ) : (
          <div className="grid min-h-0 grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
            {sections.map((section) => (
              <section
                key={section.key}
                id={section.key}
                className="border-border bg-surface-raised rounded-card flex min-h-0 flex-col overflow-hidden border"
              >
                <div className="border-border shrink-0 border-b px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-display font-display text-fg-default leading-none tabular-nums">
                      {section.tasks.length}
                    </span>
                    <h2 className="text-heading font-display text-fg-default">{t(section.key)}</h2>
                  </div>
                  <p className="text-caption text-fg-muted mt-1.5">{t(`${section.key}Body`)}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto py-2">
                  <TaskListFlat
                    tasks={section.tasks}
                    emptyTitle={t(SECTION_EMPTY[section.key][0])}
                    emptyBody={t(SECTION_EMPTY[section.key][1])}
                    showAssignee={false}
                    todayIso={todayIso}
                    showBlockedReason
                    assignablePeople={assignablePeople}
                    viewer={viewer}
                  />
                </div>
              </section>
            ))}
          </div>
        )}

        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <NextMeetings
            meetings={meetings}
            timeZone={session.organization.timezone}
            today={todayKey}
          />

          {myUnplanned.length > 0 ? (
            <div className="flex flex-col gap-2">
              {myUnplanned.map((row) => (
                <Link
                  key={row.projectId}
                  href={`/work/${row.projectKey}`}
                  className={cn("group block rounded-control", focusRing, transition)}
                >
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

          {myProjectMemberships.length > 0 ? (
            <div id="my-projects">
              <h2 className="text-heading font-display text-fg-default mb-2">{t("myProjects")}</h2>
              <div className="grid grid-cols-1 gap-3">
                {myProjectMemberships.map((project) => (
                  <Link
                    key={project.id}
                    href={`/work/${project.key}`}
                    className={cn(
                      "border-border bg-surface-raised hover:bg-surface-hover rounded-card block border p-3",
                      focusRing,
                      transition,
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-caption text-fg-subtle truncate">{project.key}</p>
                        <p className="text-body text-fg-default truncate font-medium">
                          {project.name}
                        </p>
                      </div>
                      <StatusPill tone={PROJECT_STATUS_TONE[project.status]} size="sm">
                        {tProjectStatus(project.status)}
                      </StatusPill>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-caption text-fg-muted">
                        {ui("openTasks", { count: openByProject.get(project.id) ?? 0 })}
                      </span>
                      {(blockedByProject.get(project.id) ?? 0) > 0 ? (
                        <CountBadge tone="blocked">{blockedByProject.get(project.id)!}</CountBadge>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <MyDeliverables items={myDeliverables} />
        </aside>
      </div>
    </div>
  );
}

/**
 * The one thing to pick up.
 *
 * A member's Today opens with a single task rather than a list, because the
 * question "what should I do now" has one answer and a list of twelve does not
 * give it.
 *
 * Red only when the task itself earns it -- overdue or blocked, the two
 * meanings CLAUDE.md's palette actually reserves red for. A next task that is
 * neither is still worth featuring, just not alarming: the same "active, in
 * progress" blue every other on-track row already uses.
 */
async function NextTaskPanel({ task, todayIso }: { task: TaskRow; todayIso: string }) {
  const t = await getTranslations("Today");
  const urgent = isOverdue(task.dueDate, todayIso, task.status) || task.status === "blocked";

  return (
    <Card
      // Spacing belongs to whatever lays this out, not to the panel itself.
      className={cn(
        urgent ? "border-blocked-border bg-blocked-bg" : "border-active-border bg-active-bg",
      )}
    >
      <CardHeader>
        <div className="min-w-0">
          <p className={cn("text-caption", urgent ? "text-blocked-text" : "text-active-text")}>
            {t("nextTask")}
          </p>
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

/**
 * One person's own open deliverables, across every project.
 *
 * Deliverables otherwise show only on their own project's Deliverables tab --
 * there was no view of "everything I owe a client" spanning more than one.
 * Read-only here: the status line, the client-feedback flow and the rest of
 * the panel's controls stay where they already work, on the project itself.
 */
export async function MyDeliverables({ items }: { items: MyDeliverableRow[] }) {
  if (items.length === 0) return null;

  const t = await getTranslations("Today");
  const statusLabels = await getTranslations("DeliverableStatus");
  const format = await getFormatter();

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-heading font-display text-fg-default">{t("myDeliverables")}</h2>
        <span className="text-caption text-fg-subtle tabular-nums">{items.length}</span>
      </div>
      <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/work/${item.projectKey}?tab=deliverables`}
              className={cn(
                "hover:bg-surface-hover flex items-center gap-3 px-3 py-2.5",
                focusRing,
                transition,
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="text-body text-fg-default block truncate">{item.title}</span>
                <span className="text-caption text-fg-subtle block truncate">
                  {item.projectKey} · {item.projectName}
                </span>
              </span>
              {item.dueDate ? (
                <span className="text-caption text-fg-muted hidden shrink-0 tabular-nums sm:block">
                  {format.dateTime(new Date(`${item.dueDate}T00:00:00`), {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              ) : null}
              <StatusPill tone={DELIVERABLE_STATUS_TONE[item.status]} size="sm" className="shrink-0">
                {statusLabels(item.status)}
              </StatusPill>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
