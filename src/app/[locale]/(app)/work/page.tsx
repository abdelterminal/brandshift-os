import { Plus } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { AvatarGroup } from "@/components/ui/avatar";
import { CountBadge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { ProjectFilters } from "@/components/work/project-filters";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/authz";
import { requireUser } from "@/lib/auth/guards";
import { listDepartments } from "@/lib/data/people";
import { listProjectMembers, listProjects, type ProjectStatus } from "@/lib/data/projects";
import { listOpenTasks } from "@/lib/data/tasks";

/**
 * Projects.
 *
 * A list, not a board. The board view belongs inside a project, where the
 * columns mean something; at this level what matters is which projects are
 * late and which have work stuck, and a table says that in one scan.
 */

const STATUS_TONE = {
  planning: "neutral",
  active: "active",
  on_hold: "attention",
  completed: "complete",
  archived: "neutral",
} as const;

export default async function WorkPage({ searchParams }: PageProps<"/[locale]/work">) {
  const session = await requireUser();
  const params = await searchParams;

  const query = typeof params.q === "string" ? params.q : undefined;
  const status = typeof params.status === "string" ? (params.status as ProjectStatus) : undefined;
  const departmentId = typeof params.department === "string" ? params.department : undefined;

  const [t, statusLabels, format, projects, departments, openTasks] = await Promise.all([
    getTranslations("Work"),
    getTranslations("ProjectStatus"),
    getFormatter(),
    listProjects(session.actor, { query, status, departmentId }),
    listDepartments(session.actor),
    listOpenTasks(session.actor),
  ]);

  // Counted from the open set already loaded rather than a query per project.
  const openByProject = new Map<string, number>();
  const blockedByProject = new Map<string, number>();
  for (const task of openTasks) {
    if (!task.projectId) continue;
    openByProject.set(task.projectId, (openByProject.get(task.projectId) ?? 0) + 1);
    if (task.status === "blocked") {
      blockedByProject.set(task.projectId, (blockedByProject.get(task.projectId) ?? 0) + 1);
    }
  }

  const teams = await Promise.all(
    projects.map((project) => listProjectMembers(session.actor, project.id)),
  );

  const ui = await getTranslations("Ui");
  const filtered = Boolean(query || status || departmentId);
  const mayCreate = can(session.actor, "project.create");

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("projects")}</p>
        </div>
        {mayCreate ? (
          <Button variant="primary" render={<Link href="/work/new" />}>
            <Plus aria-hidden className="size-4" />
            {t("newProject")}
          </Button>
        ) : null}
      </header>

      <div className="mt-6">
        <ProjectFilters departments={departments} />
      </div>

      {projects.length === 0 ? (
        <div className="border-border rounded-card mt-4 border">
          <EmptyState
            title={filtered ? t("noMatches") : t("noProjects")}
            description={filtered ? t("noMatchesBody") : t("noProjectsBody")}
            action={
              !filtered && mayCreate ? (
                <Button variant="primary" render={<Link href="/work/new" />}>
                  <Plus aria-hidden className="size-4" />
                  {t("newProject")}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
        <ul className="border-border divide-border bg-surface-raised mt-4 divide-y rounded-card border md:hidden">
          {projects.map((project, index) => <li key={project.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={`/work/${project.key}`} className="text-body text-fg-default focus-visible:outline-focus-ring min-w-0 rounded-control font-medium hover:underline focus-visible:outline-2">{project.name}</Link>
              <StatusPill tone={STATUS_TONE[project.status]} size="sm">{statusLabels(project.status)}</StatusPill>
            </div>
            <p className="text-caption text-fg-muted mt-2">{[project.key, project.departmentName].filter(Boolean).join(" · ")}</p>
            <p className="text-caption text-fg-muted mt-1">{t("due")}: {project.dueDate ? format.dateTime(new Date(`${project.dueDate}T00:00:00`), { day: "numeric", month: "short", year: "numeric" }) : t("noDueDate")}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption text-fg-muted">{ui("openTasks", { count: openByProject.get(project.id) ?? 0 })}</span>
                {(blockedByProject.get(project.id) ?? 0) > 0 ? <StatusPill tone="blocked" size="sm">{ui("blocked", { count: blockedByProject.get(project.id)! })}</StatusPill> : null}
              </div>
              <AvatarGroup people={teams[index]!.map(member => ({ name: member.name, src: member.avatarUrl }))} size="sm" max={3} />
            </div>
          </li>)}
        </ul>
        <TableContainer className="mt-4 hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("projects")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("department")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("tasks")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("due")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("team")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project, index) => {
                const open = openByProject.get(project.id) ?? 0;
                const blocked = blockedByProject.get(project.id) ?? 0;

                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        href={`/work/${project.key}`}
                        className="text-fg-default focus-visible:outline-focus-ring rounded-[4px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {project.name}
                      </Link>
                      <div className="text-caption text-fg-subtle mt-0.5">{project.key}</div>
                    </TableCell>

                    <TableCell>
                      <StatusPill tone={STATUS_TONE[project.status]} size="sm">
                        {statusLabels(project.status)}
                      </StatusPill>
                    </TableCell>

                    <TableCell className="text-fg-muted hidden md:table-cell">
                      {project.departmentName ?? "--"}
                    </TableCell>

                    <TableCell className="hidden lg:table-cell">
                      <span className="flex items-center gap-2">
                        <span className="text-fg-muted tabular-nums">{open}</span>
                        {blocked > 0 ? (
                          <CountBadge tone="blocked">{blocked}</CountBadge>
                        ) : null}
                      </span>
                    </TableCell>

                    <TableCell className="text-fg-muted hidden tabular-nums sm:table-cell">
                      {project.dueDate
                        ? format.dateTime(new Date(`${project.dueDate}T00:00:00`), {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : t("noDueDate")}
                    </TableCell>

                    <TableCell className="hidden lg:table-cell">
                      <AvatarGroup
                        people={teams[index]!.map((member) => ({
                          name: member.name,
                          src: member.avatarUrl,
                        }))}
                        size="sm"
                        max={3}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        </>
      )}
    </div>
  );
}
