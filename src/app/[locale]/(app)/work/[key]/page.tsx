import { MessagesSquare } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ProjectMeetings } from "@/components/calendar/project-meetings";
import { ActivityFeed } from "@/components/work/activity-feed";
import { ProjectTabs } from "@/components/work/project-tabs";
import { CaptureTemplateButton } from "@/components/templates/controls";
import { PersonAvatar } from "@/components/ui/avatar";
import { CountBadge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { listProjectActivity } from "@/lib/data/activity";
import { listProjectMeetings } from "@/lib/data/meetings";
import { getProjectByKey, listProjectMembers } from "@/lib/data/projects";
import { bucketTasks, listProjectTasks, organizationToday } from "@/lib/data/tasks";

/**
 * A project, as a routed page with tabs -- not a modal.
 *
 * Overview, Tasks, Team and Activity are each linkable, which is what makes a
 * project something you can send someone rather than something you have to
 * describe how to reach. The old app opened this in a stacked modal and people
 * lost track of where they were.
 */

const STATUS_TONE = {
  planning: "neutral",
  active: "active",
  on_hold: "attention",
  completed: "complete",
  archived: "neutral",
} as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/work/[key]">) {
  const session = await requireUser();
  const { key } = await params;
  const project = await getProjectByKey(session.actor, key);
  return { title: project?.name ?? key };
}

export default async function ProjectPage({
  params,
  searchParams,
}: PageProps<"/[locale]/work/[key]">) {
  const session = await requireUser();
  const { key } = await params;
  const { task } = await searchParams;

  const project = await getProjectByKey(session.actor, key);
  if (!project) notFound();

  const [
    t,
    channels,
    templateText,
    statusLabels,
    priorities,
    format,
    tasks,
    members,
    activity,
    meetings,
  ] = await Promise.all([
    getTranslations("Work"),
    getTranslations("Channels"),
    getTranslations("Templates"),
    getTranslations("ProjectStatus"),
    getTranslations("Priority"),
    getFormatter(),
    listProjectTasks(session.actor, project.id),
    listProjectMembers(session.actor, project.id),
    listProjectActivity(session.actor, project.id),
    listProjectMeetings(session.actor, project.id),
  ]);

  const mayManageTemplates = can(session.actor, "template.manage");

  const open = tasks.filter(
    (task) => task.status === "todo" || task.status === "in_progress" || task.status === "blocked",
  );
  const done = tasks.filter((task) => task.status === "done");
  const blocked = tasks.filter((task) => task.status === "blocked");
  const buckets = bucketTasks(open, done, organizationToday());

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-fg-subtle">{project.key}</p>
            <h1 className="text-display font-display text-fg-default mt-0.5">{project.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={STATUS_TONE[project.status]}>
              {statusLabels(project.status)}
            </StatusPill>
            {blocked.length > 0 ? <CountBadge tone="blocked">{blocked.length}</CountBadge> : null}

            {/*
              A link, not a tab. The conversation has one home at
              `/channels/<slug>`, so the URL somebody pastes into a message and
              the one they reach from here are the same page -- and this route
              creates the channel first for a project that predates them.
            */}
            <Button size="sm" render={<Link href={`/work/${project.key}/channel`} />}>
              <MessagesSquare aria-hidden className="size-4" />
              {channels("openChannel")}
            </Button>

            {/*
              Keep the shape of a job that went well. Offsets are measured back
              from this project's start date, so the template can be run again
              from any Monday -- see `fromProjectTasks`.
            */}
            {mayManageTemplates && tasks.length > 0 ? (
              <CaptureTemplateButton
                from="project"
                sourceId={project.id}
                suggestedName={project.name}
                label={templateText("captureFromProject")}
              />
            ) : null}
          </div>
        </div>

        <dl className="text-body mt-4 flex flex-wrap gap-x-8 gap-y-2">
          <div className="flex items-center gap-2">
            <dt className="text-fg-muted">{t("owner")}</dt>
            <dd className="text-fg-default flex items-center gap-1.5">
              {project.ownerName ? (
                <>
                  <PersonAvatar name={project.ownerName} size="xs" />
                  {project.ownerName}
                </>
              ) : (
                "--"
              )}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-fg-muted">{t("department")}</dt>
            <dd className="text-fg-default">{project.departmentName ?? "--"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-fg-muted">{t("due")}</dt>
            <dd className="text-fg-default tabular-nums">
              {project.dueDate
                ? format.dateTime(new Date(`${project.dueDate}T00:00:00`), {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : t("noDueDate")}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-fg-muted">{t("tasks")}</dt>
            <dd className="text-fg-default tabular-nums">
              {t("progress", { done: done.length, total: tasks.length })}
            </dd>
          </div>
        </dl>
      </header>

      <div className="mt-8">
        <ProjectTabs
          /*
           * A link to a task has to land on the task. Without this the drawer
           * is mounted inside the Tasks panel, which an inactive tab does not
           * render -- so `?task=<id>` opened Overview and showed nothing, and
           * the shareable link was only shareable with someone already looking
           * at the right tab.
           */
          defaultTab={typeof task === "string" && task ? "tasks" : "overview"}
          description={project.description}
          priority={priorities(project.priority)}
          buckets={buckets}
          allTasks={tasks}
          members={members.map((member) => ({
            userId: member.userId,
            name: member.name,
            avatarUrl: member.avatarUrl,
            role: member.role,
          }))}
          activity={<ActivityFeed events={activity} />}
          meetings={
            <ProjectMeetings
              meetings={meetings}
              projectId={project.id}
              timeZone={session.organization.timezone}
            />
          }
        />
      </div>
    </div>
  );
}
