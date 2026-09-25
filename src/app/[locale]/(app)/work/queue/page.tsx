import { getTranslations } from "next-intl/server";

import { QueueLaneHeader } from "@/components/work/queue-lane-header";
import { TaskListFlat } from "@/components/work/task-list";
import { UnplannedList } from "@/components/work/unplanned-list";
import { Card, CardContent } from "@/components/ui/card";
import { focusRing } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listAssignablePeople } from "@/lib/data/people";
import { listWorkableProjectIds } from "@/lib/data/project-access";
import { atLeast } from "@/lib/authz";
import { listUnplannedMembers, planningGraceHours } from "@/lib/data/planning";
import { coordinationQueue, organizationToday } from "@/lib/data/tasks";
import { cn } from "@/lib/utils";

/** The coordination queue's own four columns -- distinct from `TaskBucket`,
 *  which buckets by due date rather than by what needs a decision. */
type QueueColumn = "blocked" | "overdue" | "unassigned" | "noPlan";

/**
 * The coordination queue, uncapped.
 *
 * Today's own "Needs a decision" cards cap each column at eight rows on
 * purpose -- a daily glance shouldn't scroll. This is the page "View all"
 * on one of those cards actually opens: the same three columns, the same
 * `coordinationQueue()` read, just without the cap, and with `?bucket=`
 * to jump straight to the one column that was full.
 *
 * Gated the formal way, with `can()` (`task.viewQueue`), rather than the
 * inline `atLeast` check Today itself still uses -- see `KNOWN-GAPS.md`
 * before assuming that inconsistency is fixed anywhere else too.
 */

const BUCKET_TONE = {
  blocked: "blocked",
  overdue: "attention",
  unassigned: "neutral",
  noPlan: "attention",
} as const;

function isBucketKey(value: string | undefined): value is QueueColumn {
  return value === "blocked" || value === "overdue" || value === "unassigned" || value === "noPlan";
}

export async function generateMetadata() {
  const t = await getTranslations("Today");
  return { title: t("queueTitle") };
}

export default async function WorkQueuePage({
  searchParams,
}: PageProps<"/[locale]/work/queue">) {
  const session = await requirePermission("task.viewQueue");
  const params = await searchParams;
  const bucketParam = typeof params.bucket === "string" ? params.bucket : undefined;
  const bucket = isBucketKey(bucketParam) ? bucketParam : undefined;

  const [t, queue, assignablePeople, unplannedAll, graceHours] = await Promise.all([
    getTranslations("Today"),
    coordinationQueue(session.actor),
    listAssignablePeople(session.actor),
    listUnplannedMembers(session.actor),
    planningGraceHours(session.actor),
  ]);
  const todayIso = organizationToday();
  const viewer = { userId: session.actor.userId, isManager: atLeast(session.actor, "manager"), projectIds: await listWorkableProjectIds(session.actor) };

  // Same rule as Today's own card: only past the grace period is this the
  // coordinator's problem rather than the member's own project page.
  const unplanned = unplannedAll.filter((row) => row.hoursSince >= graceHours);

  const columns = (
    [
      { key: "blocked", tasks: queue.blocked },
      { key: "overdue", tasks: queue.overdue },
      { key: "unassigned", tasks: queue.unassigned },
    ] as const
  ).filter((column) => !bucket || column.key === bucket);
  const showNoPlan = !bucket || bucket === "noPlan";

  return (
    <div className="px-5 py-8 sm:px-8">
      <BackLink />

      <header className="mt-5">
        <h1 className="text-display font-display text-fg-default">{t("queueTitle")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("queueBody")}</p>
      </header>

      <div className={cn("mt-6 grid gap-4", !bucket && "lg:grid-cols-2 xl:grid-cols-4")}>
        {columns.map((column) => (
          <Card key={column.key} className="min-w-0 overflow-hidden">
            <QueueLaneHeader
              title={t(column.key)}
              description={t(`${column.key}Body`)}
              count={column.tasks.length}
              tone={BUCKET_TONE[column.key]}
            />
            <CardContent className="px-0 pt-2 pb-2">
              <TaskListFlat
                tasks={column.tasks}
                emptyTitle={t(`${column.key}Empty`)}
                emptyBody={t(`${column.key}Body`)}
                todayIso={todayIso}
                assignablePeople={assignablePeople}
                viewer={viewer}
              />
            </CardContent>
          </Card>
        ))}

        {showNoPlan ? (
          <Card className="min-w-0 overflow-hidden">
            <QueueLaneHeader
              title={t("noPlan")}
              description={t("noPlanBody")}
              count={unplanned.length}
              tone={BUCKET_TONE.noPlan}
            />
            <CardContent className="px-0 pt-2 pb-2">
              <UnplannedList items={unplanned} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

async function BackLink() {
  const t = await getTranslations("Ui");
  return (
    <Link
      href="/today"
      className={cn("text-label text-fg-muted rounded-control hover:underline", focusRing)}
    >
      {t("backToList")}
    </Link>
  );
}
