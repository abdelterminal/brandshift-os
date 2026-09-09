"use client";

import { AlertTriangle, Circle, CircleCheck, CircleDot } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import type { Tone } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import type { TaskBucket, TaskRow } from "@/lib/data/task-types";
import { dueDateLabel, isOverdue } from "@/lib/due-date";
import { cn } from "@/lib/utils";

import { TaskDrawer } from "./task-drawer";

/**
 * The prioritised task list.
 *
 * Lists before boards: this is the default view of work everywhere, and the
 * Kanban is the secondary one. The buckets are the point -- a flat list sorted
 * by date makes each person work out what matters, and these say it.
 *
 * The open task is in the URL as `?task=<id>`, so the browser's back button
 * closes the drawer and a link to a task opens it.
 */

export const STATUS_TONE: Record<TaskRow["status"], Tone> = {
  todo: "neutral",
  in_progress: "active",
  blocked: "blocked",
  done: "complete",
  cancelled: "neutral",
};

const STATUS_ICON = {
  todo: Circle,
  in_progress: CircleDot,
  blocked: AlertTriangle,
  done: CircleCheck,
  cancelled: Circle,
} as const;

const BUCKET_TONE: Record<TaskBucket, Tone> = {
  overdue: "blocked",
  today: "attention",
  upcoming: "active",
  noDeadline: "neutral",
  completed: "complete",
};

export function TaskList({
  buckets,
  order,
  showProject = true,
  emptyTitle,
  emptyBody,
  todayIso,
}: {
  buckets: Partial<Record<TaskBucket, TaskRow[]>>;
  order: TaskBucket[];
  showProject?: boolean;
  emptyTitle: string;
  emptyBody: string;
  /**
   * `YYYY-MM-DD` in the organization's timezone, for the relative due-date
   * label ("in 3 days") and for recognising a task as overdue independent of
   * its bucket. Optional: without it, dates render as plain "d MMM" and only
   * the bucket's own tone (already correct -- `overdue` buckets go in here
   * pre-sorted by `bucketTasks()`) drives the color.
   */
  todayIso?: string;
}) {
  const t = useTranslations("Task");
  const router = useRouter();
  const searchParams = useSearchParams();
  const openId = searchParams.get("task");

  const all = useMemo(
    () => order.flatMap((bucket) => buckets[bucket] ?? []),
    [buckets, order],
  );
  const openTask = all.find((task) => task.id === openId) ?? null;

  const setOpenTask = useCallback(
    (taskId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (taskId) next.set("task", taskId);
      else next.delete("task");
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const total = all.length;

  return (
    <>
      {total === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={emptyTitle} description={emptyBody} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {order.map((bucket) => {
            const rows = buckets[bucket] ?? [];
            if (rows.length === 0) return null;

            return (
              <section key={bucket}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-label text-fg-default">
                    {t(
                      `bucket${bucket.charAt(0).toUpperCase()}${bucket.slice(1)}` as
                        | "bucketOverdue"
                        | "bucketToday"
                        | "bucketUpcoming"
                        | "bucketNoDeadline"
                        | "bucketCompleted",
                    )}
                  </h3>
                  <span className="text-caption text-fg-subtle tabular-nums">{rows.length}</span>
                </div>

                <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
                  {rows.map((task) => (
                    <TaskListRow
                      key={task.id}
                      task={task}
                      tone={BUCKET_TONE[bucket]}
                      showProject={showProject}
                      todayIso={todayIso}
                      onOpen={() => setOpenTask(task.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <TaskDrawer task={openTask} onClose={() => setOpenTask(null)} />
    </>
  );
}

function TaskListRow({
  task,
  tone,
  showProject,
  todayIso,
  showBlockedReason = false,
  onOpen,
}: {
  task: TaskRow;
  tone: Tone;
  showProject: boolean;
  todayIso?: string;
  /**
   * One truncated line of `blockedReason` under the title. Off by default --
   * the coordination queue already groups a whole column under "Blocked",
   * where the reason would repeat what the heading says; `MyDay` turns it on,
   * since there the reason is the one thing that changes what "pick this up"
   * even means, and it's otherwise hidden behind opening the drawer.
   */
  showBlockedReason?: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("Task");
  const priorities = useTranslations("Priority");
  const format = useFormatter();
  const Icon = STATUS_ICON[task.status];

  // Late is a fact about the date, not about whether someone has gotten
  // around to marking the task Blocked -- see due-date.ts. Without a
  // `todayIso` (a caller that already sorted this into a bucket whose own
  // tone says the same thing) this just agrees with `tone`.
  const overdue = todayIso ? isOverdue(task.dueDate, todayIso, task.status) : tone === "blocked";
  const dateTone: Tone = overdue ? "blocked" : tone;

  const label = task.dueDate && todayIso ? dueDateLabel(task.dueDate, todayIso) : null;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("openTask")}
        className={cn(
          "hover:bg-surface-hover flex w-full items-center gap-3 px-3 py-2.5 text-left",
          focusRingInset,
          transition,
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-4 shrink-0",
            task.status === "done" && "text-complete-solid",
            (task.status === "blocked" || overdue) && "text-blocked-solid",
            task.status === "in_progress" && !overdue && "text-active-solid",
            (task.status === "todo" || task.status === "cancelled") &&
              !overdue &&
              "text-fg-subtle",
          )}
        />

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span
              className={cn(
                "text-body truncate",
                task.status === "done" ? "text-fg-muted line-through" : "text-fg-default",
              )}
            >
              {task.title}
            </span>
            {/* Every task already carries a priority; medium and low are the
                default and stay silent, so only urgent/high earn a pill --
                the exact one the drawer already shows, just moved onto the
                row, rather than a colour: CLAUDE.md's tone vocabulary is
                closed, and priority isn't one of its five meanings. */}
            {task.priority === "urgent" || task.priority === "high" ? (
              <StatusPill tone="neutral" size="sm" className="shrink-0">
                {priorities(task.priority)}
              </StatusPill>
            ) : null}
          </span>
          {showProject && task.projectName ? (
            <span className="text-caption text-fg-subtle block truncate">
              {task.projectKey} · {task.projectName}
            </span>
          ) : null}
          {showBlockedReason && task.status === "blocked" && task.blockedReason ? (
            <span className="text-caption text-fg-muted mt-0.5 block truncate">
              {task.blockedReason}
            </span>
          ) : null}
        </span>

        {/* No "Blocker" pill here. The red warning icon already says it, and in
            the coordination queue the whole column is blocked work -- the pill
            repeated that while squeezing the title it sat next to. The reason
            itself is in the drawer (or, on `MyDay`, the line above) rather
            than repeated here too. */}

        {task.dueDate ? (
          <span
            className={cn(
              "text-caption hidden shrink-0 tabular-nums sm:block",
              dateTone === "blocked" ? "text-blocked-text" : "text-fg-muted",
            )}
          >
            {label?.kind === "today"
              ? t("dueToday")
              : label?.kind === "in"
                ? t("dueIn", { days: label.days })
                : label?.kind === "overdueBy"
                  ? t("overdueBy", { days: label.days })
                  : format.dateTime(new Date(`${task.dueDate}T00:00:00`), {
                      day: "numeric",
                      month: "short",
                    })}
          </span>
        ) : null}

        {task.assigneeName ? (
          <PersonAvatar name={task.assigneeName} size="xs" className="shrink-0" />
        ) : (
          <span className="text-caption text-fg-subtle shrink-0">{t("unassigned")}</span>
        )}
      </button>
    </li>
  );
}

/**
 * A compact list for the coordination queue and the person page, where the
 * bucket headings would repeat what the column heading already said.
 */
export function TaskListFlat({
  tasks,
  emptyTitle,
  emptyBody,
  showProject = true,
  max,
  todayIso,
  showBlockedReason,
}: {
  tasks: TaskRow[];
  emptyTitle: string;
  emptyBody: string;
  showProject?: boolean;
  max?: number;
  /** See `TaskList`'s own doc -- same prop, same reason. */
  todayIso?: string;
  showBlockedReason?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openId = searchParams.get("task");
  const shown = max ? tasks.slice(0, max) : tasks;
  const openTask = tasks.find((task) => task.id === openId) ?? null;

  const setOpenTask = (taskId: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (taskId) next.set("task", taskId);
    else next.delete("task");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  if (tasks.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyBody} className="py-8" />;
  }

  return (
    <>
      <ul className="divide-border divide-y">
        {shown.map((task) => (
          <TaskListRow
            key={task.id}
            task={task}
            tone={STATUS_TONE[task.status]}
            showProject={showProject}
            todayIso={todayIso}
            showBlockedReason={showBlockedReason}
            onOpen={() => setOpenTask(task.id)}
          />
        ))}
      </ul>
      <TaskDrawer task={openTask} onClose={() => setOpenTask(null)} />
    </>
  );
}
