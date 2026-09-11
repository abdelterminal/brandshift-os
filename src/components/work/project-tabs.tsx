"use client";

import { Columns3, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { BUCKET_ORDER, type AssignablePerson, type TaskBucket, type TaskRow } from "@/lib/data/task-types";
import { cn } from "@/lib/utils";

import { NewTaskDialog } from "./new-task-dialog";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import type { TaskDrawerViewer } from "./task-drawer";

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
  projectId,
  buckets,
  todayIso,
  allTasks,
  assignablePeople,
  viewer,
  siloed = false,
  members,
  canEditBoard,
  activity,
  meetings,
  docs,
  deliverables,
  stageRail,
  stageControl,
  stageSetup,
  stageProcedure,
}: {
  /** Which tab opens first. `tasks` when the URL names a task. */
  defaultTab?: "overview" | "tasks" | "deliverables" | "team" | "activity" | "docs";
  description: string | null;
  priority: string;
  projectId: string;
  buckets: Record<TaskBucket, TaskRow[]>;
  /** `YYYY-MM-DD` in the organization's timezone -- see `TaskList`'s own doc. */
  todayIso: string;
  allTasks: TaskRow[];
  /** Passed straight through to the drawer's own reassignment picker. */
  assignablePeople: AssignablePerson[];
  viewer: TaskDrawerViewer;
  /**
   * True for a member: the Activity tab is gone (it is a running log of
   * everyone's actions), and the Team tab shows names without roles.
   */
  siloed?: boolean;
  members: Array<{ userId: string; name: string; avatarUrl: string | null; role: string }>;
  /** Whether the signed-in person is this project's own lead or contributor -- see the page. */
  canEditBoard: boolean;
  /** Null for a member -- see `siloed`. */
  activity: React.ReactNode | null;
  /**
   * The project's meetings, rendered on the server and handed in as a slot --
   * the same arrangement as `activity`, because this is a Client Component and
   * the data behind it is `server-only`.
   */
  meetings: React.ReactNode;
  /** The Docs tab's content -- server-rendered, handed in like `activity`. */
  docs: React.ReactNode;
  /** The Deliverables tab's content -- a Client Component slot. */
  deliverables: React.ReactNode;
  /** The eight-stage progress rail, server-rendered. */
  stageRail: React.ReactNode;
  /** The stage picker for the Overview panel -- a Client Component slot. */
  stageControl: React.ReactNode;
  /** The "set up this stage" button / done note -- a Client Component slot. */
  stageSetup: React.ReactNode;
  /** The "procedure for this stage" block, server-rendered, or null. */
  stageProcedure: React.ReactNode;
}) {
  const t = useTranslations("Work");

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTab value="overview">{t("overview")}</TabsTab>
        <TabsTab value="tasks">{t("tasks")}</TabsTab>
        <TabsTab value="deliverables">{t("deliverables")}</TabsTab>
        <TabsTab value="docs">{t("docs")}</TabsTab>
        <TabsTab value="team">{t("team")}</TabsTab>
        {siloed ? null : <TabsTab value="activity">{t("activity")}</TabsTab>}
      </TabsList>

      <TabsPanel value="overview">
        <div className="mb-5 space-y-3">
          {stageRail}
          <div className="flex flex-wrap items-center gap-3">
            {stageControl}
            {stageSetup}
          </div>
        </div>

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

        {stageProcedure ? <div className="mt-6">{stageProcedure}</div> : null}

        {/* What is booked about this work, where somebody reading about the
            project will actually see it. */}
        <div className="mt-8">{meetings}</div>
      </TabsPanel>

      <TabsPanel value="tasks">
        <TasksPanel
          projectId={projectId}
          buckets={buckets}
          todayIso={todayIso}
          allTasks={allTasks}
          assignablePeople={assignablePeople}
          viewer={viewer}
          canEditBoard={canEditBoard}
        />
      </TabsPanel>

      <TabsPanel value="deliverables">{deliverables}</TabsPanel>

      <TabsPanel value="docs">{docs}</TabsPanel>

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
                {siloed ? null : (
                  <Badge tone={member.role === "lead" ? "accent" : "neutral"} size="sm">
                    {member.role}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </TabsPanel>

      {siloed ? null : <TabsPanel value="activity">{activity}</TabsPanel>}
    </Tabs>
  );
}

/** List by default, board on request. */
function TasksPanel({
  projectId,
  buckets,
  todayIso,
  allTasks,
  assignablePeople,
  viewer,
  canEditBoard,
}: {
  projectId: string;
  buckets: Record<TaskBucket, TaskRow[]>;
  todayIso: string;
  allTasks: TaskRow[];
  assignablePeople: AssignablePerson[];
  viewer: TaskDrawerViewer;
  canEditBoard: boolean;
}) {
  const t = useTranslations("Work");
  const [view, setView] = useState<"list" | "board">("list");
  // The same population mayWorkOn() opens a task's own actions to: the
  // project's own assignee, lead or contributor, or a manager.
  const canAddTask = viewer.isManager || viewer.projectIds.includes(projectId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label={`${t("listView")} / ${t("boardView")}`}
          className="border-border bg-surface-raised inline-flex items-center gap-0.5 rounded-control border p-0.5"
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

        {canAddTask ? (
          <NewTaskDialog
            projectId={projectId}
            assignablePeople={assignablePeople}
            currentUserId={viewer.userId}
          />
        ) : null}
      </div>

      {view === "list" ? (
        <TaskList
          buckets={buckets}
          order={BUCKET_ORDER}
          showProject={false}
          emptyTitle={t("noTasks")}
          emptyBody={t("noTasksBody")}
          todayIso={todayIso}
          assignablePeople={assignablePeople}
          viewer={viewer}
        />
      ) : (
        <TaskBoard
          tasks={allTasks}
          projectId={projectId}
          canEditBoard={canEditBoard}
          assignablePeople={assignablePeople}
          viewer={viewer}
        />
      )}
    </div>
  );
}

