import { getTranslations } from "next-intl/server";

import { TaskListFlat } from "@/components/work/task-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/badge";
import { focusRing } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listAssignablePeople } from "@/lib/data/people";
import { coordinationQueue, organizationToday } from "@/lib/data/tasks";
import { cn } from "@/lib/utils";

/** The coordination queue's own three columns -- distinct from `TaskBucket`,
 *  which buckets by due date rather than by what needs a decision. */
type QueueColumn = "blocked" | "overdue" | "unassigned";

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
} as const;

function isBucketKey(value: string | undefined): value is QueueColumn {
  return value === "blocked" || value === "overdue" || value === "unassigned";
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

  const [t, queue, assignablePeople] = await Promise.all([
    getTranslations("Today"),
    coordinationQueue(session.actor),
    listAssignablePeople(session.actor),
  ]);
  const todayIso = organizationToday();

  const columns = (
    [
      { key: "blocked", tasks: queue.blocked },
      { key: "overdue", tasks: queue.overdue },
      { key: "unassigned", tasks: queue.unassigned },
    ] as const
  ).filter((column) => !bucket || column.key === bucket);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <BackLink />

      <header className="mt-5">
        <h1 className="text-display font-display text-fg-default">{t("queueTitle")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("queueBody")}</p>
      </header>

      <div className={cn("mt-6 grid gap-4", !bucket && "lg:grid-cols-3")}>
        {columns.map((column) => (
          <Card key={column.key} className="min-w-0">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  {t(column.key)}
                  <CountBadge tone={column.tasks.length > 0 ? BUCKET_TONE[column.key] : "neutral"}>
                    {column.tasks.length}
                  </CountBadge>
                </CardTitle>
                <p className="text-caption text-fg-muted mt-1">{t(`${column.key}Body`)}</p>
              </div>
            </CardHeader>
            <CardContent className="px-0 pt-1 pb-2">
              <TaskListFlat
                tasks={column.tasks}
                emptyTitle={t(`${column.key}Empty`)}
                emptyBody={t(`${column.key}Body`)}
                todayIso={todayIso}
                assignablePeople={assignablePeople}
              />
            </CardContent>
          </Card>
        ))}
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
