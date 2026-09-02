"use client";

import { Columns3, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import { Badge, StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { BUCKET_ORDER, type TaskBucket, type TaskRow } from "@/lib/data/task-types";
import { cn } from "@/lib/utils";

import { STATUS_TONE, TaskList } from "./task-list";

/**
 * A project's tabs.
 *
 * Tasks default to the prioritised list. The board is the secondary view and
 * has to be asked for -- it is good for seeing flow across a small number of
 * columns, and bad for answering "what is late", which is the question people
 * actually arrive with.
 */
export function ProjectTabs({
  defaultTab = "overview",
  description,
  priority,
  buckets,
  allTasks,
  members,
  activity,
}: {
  /** Which tab opens first. `tasks` when the URL names a task. */
  defaultTab?: "overview" | "tasks" | "team" | "activity";
  description: string | null;
  priority: string;
  buckets: Record<TaskBucket, TaskRow[]>;
  allTasks: TaskRow[];
  members: Array<{ userId: string; name: string; avatarUrl: string | null; role: string }>;
  activity: React.ReactNode;
}) {
  const t = useTranslations("Work");

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTab value="overview">{t("overview")}</TabsTab>
        <TabsTab value="tasks">{t("tasks")}</TabsTab>
        <TabsTab value="team">{t("team")}</TabsTab>
        <TabsTab value="activity">{t("activity")}</TabsTab>
      </TabsList>

      <TabsPanel value="overview">
        {description ? (
          <p className="text-body-lg text-fg-default max-w-2xl whitespace-pre-line">
            {description}
          </p>
        ) : (
          <p className="text-body text-fg-subtle">--</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>{priority}</Badge>
        </div>
      </TabsPanel>

      <TabsPanel value="tasks">
        <TasksPanel buckets={buckets} allTasks={allTasks} />
      </TabsPanel>

      <TabsPanel value="team">
        {members.length === 0 ? (
          <div className="border-border rounded-card border">
            <EmptyState title={t("noTeam")} description={t("noTeamBody")} />
          </div>
        ) : (
          <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
                <PersonAvatar name={member.name} src={member.avatarUrl} size="md" />
                <span className="text-body text-fg-default min-w-0 flex-1 truncate">
                  {member.name}
                </span>
                <Badge tone={member.role === "lead" ? "accent" : "neutral"} size="sm">
                  {member.role}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </TabsPanel>

      <TabsPanel value="activity">{activity}</TabsPanel>
    </Tabs>
  );
}

/** List by default, board on request. */
function TasksPanel({
  buckets,
  allTasks,
}: {
  buckets: Record<TaskBucket, TaskRow[]>;
  allTasks: TaskRow[];
}) {
  const t = useTranslations("Work");
  const [view, setView] = useState<"list" | "board">("list");

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={`${t("listView")} / ${t("boardView")}`}
        className="border-border bg-surface-raised mb-4 inline-flex items-center gap-0.5 rounded-control border p-0.5"
      >
        {(["list", "board"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={view === option}
            onClick={() => setView(option)}
            className={cn(
              "text-label inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5",
              "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-1",
              "transition-colors duration-[var(--duration-fast)]",
              view === option
                ? "bg-accent-subtle text-accent-text"
                : "text-fg-muted hover:bg-surface-hover hover:text-fg-default",
            )}
          >
            {option === "list" ? (
              <List aria-hidden className="size-4" />
            ) : (
              <Columns3 aria-hidden className="size-4" />
            )}
            {option === "list" ? t("listView") : t("boardView")}
          </button>
        ))}
      </div>

      {view === "list" ? (
        <TaskList
          buckets={buckets}
          order={BUCKET_ORDER}
          showProject={false}
          emptyTitle={t("noTasks")}
          emptyBody={t("noTasksBody")}
        />
      ) : (
        <TaskBoard tasks={allTasks} />
      )}
    </div>
  );
}

/** The secondary view: one column per status, scrolling sideways on its own. */
function TaskBoard({ tasks }: { tasks: TaskRow[] }) {
  const statuses = useTranslations("Status");
  const t = useTranslations("Work");

  const columns = (["todo", "in_progress", "blocked", "done"] as const).map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));

  if (tasks.length === 0) {
    return (
      <div className="border-border rounded-card border">
        <EmptyState title={t("noTasks")} description={t("noTasksBody")} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[48rem] gap-3">
        {columns.map((column) => (
          <div key={column.status} className="bg-surface-sunken min-w-0 flex-1 rounded-card p-2">
            <div className="mb-2 flex items-center gap-2 px-1">
              <h4 className="text-label text-fg-default">{statuses(column.status)}</h4>
              <span className="text-caption text-fg-subtle tabular-nums">
                {column.tasks.length}
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {column.tasks.map((task) => (
                <li
                  key={task.id}
                  className="bg-surface-raised border-border rounded-control border p-2.5"
                >
                  <p className="text-body text-fg-default">{task.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusPill tone={STATUS_TONE[task.status]} size="sm">
                      {statuses(task.status)}
                    </StatusPill>
                    {task.assigneeName ? (
                      <PersonAvatar name={task.assigneeName} size="xs" />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
