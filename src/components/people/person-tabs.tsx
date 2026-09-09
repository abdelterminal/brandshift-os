"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { focusRing, transition } from "@/components/ui/styles";
import { TaskList } from "@/components/work/task-list";
import { Link } from "@/i18n/navigation";
import { updateMemberRole } from "@/lib/actions/people";
import type { ModulePermissions, Role } from "@/db/schema/people";
import { BUCKET_ORDER, type TaskBucket, type TaskRow } from "@/lib/data/task-types";
import { cn } from "@/lib/utils";

const PROJECT_STATUS_TONE = {
  planning: "neutral",
  active: "active",
  on_hold: "attention",
  completed: "complete",
  archived: "neutral",
} as const;

export function PersonTabs({
  person,
  openCount,
  overdueCount,
  buckets,
  todayIso,
  projects,
  canEditRole,
  isSelf,
  activity,
}: {
  person: {
    userId: string;
    role: Role;
    permissions: ModulePermissions;
    departmentId: string | null;
    jobTitle: string | null;
  };
  openCount: number;
  overdueCount: number;
  buckets: Record<TaskBucket, TaskRow[]>;
  /** `YYYY-MM-DD` in the organization's timezone -- see `TaskList`'s own doc. */
  todayIso: string;
  projects: Array<{ id: string; key: string; name: string; status: keyof typeof PROJECT_STATUS_TONE }>;
  canEditRole: boolean;
  isSelf: boolean;
  activity: React.ReactNode;
}) {
  const t = useTranslations("People");
  const statusLabels = useTranslations("ProjectStatus");

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTab value="overview">{t("overview")}</TabsTab>
        <TabsTab value="work">{t("work")}</TabsTab>
        <TabsTab value="activity">{t("activity")}</TabsTab>
      </TabsList>

      <TabsPanel value="overview">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("workload")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <dl className="flex gap-8">
                <div>
                  <dt className="text-caption text-fg-muted">{t("openTasks")}</dt>
                  <dd className="text-display font-display text-fg-default mt-1 tabular-nums">
                    {openCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-fg-muted">{t("overdueTasks")}</dt>
                  <dd
                    className={cn(
                      "text-display font-display mt-1 tabular-nums",
                      overdueCount > 0 ? "text-blocked-text" : "text-fg-default",
                    )}
                  >
                    {overdueCount}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("projects")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {projects.length === 0 ? (
                <p className="text-body text-fg-muted">{t("noProjects")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {projects.map((project) => (
                    <li key={project.id} className="flex items-center gap-2">
                      <Link
                        href={`/work/${project.key}`}
                        className={cn(
                          "text-body text-fg-default min-w-0 flex-1 truncate rounded-[4px] hover:underline",
                          focusRing,
                          transition,
                        )}
                      >
                        {project.name}
                      </Link>
                      <StatusPill tone={PROJECT_STATUS_TONE[project.status]} size="sm">
                        {statusLabels(project.status)}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {canEditRole ? (
          <div className="mt-4">
            <RoleEditor person={person} isSelf={isSelf} />
          </div>
        ) : null}
      </TabsPanel>

      <TabsPanel value="work">
        <TaskList
          buckets={buckets}
          order={BUCKET_ORDER}
          emptyTitle={t("noOpenWork")}
          emptyBody={t("noOpenWorkBody")}
          todayIso={todayIso}
        />
      </TabsPanel>

      <TabsPanel value="activity">{activity}</TabsPanel>
    </Tabs>
  );
}

const MODULES = [
  { key: "finance", label: "moduleFinance" },
  { key: "people", label: "modulePeople" },
  { key: "crm", label: "moduleCrm" },
  { key: "insights", label: "moduleInsights" },
] as const;

/**
 * Role and module access.
 *
 * Both are edited together because they answer one question -- what may this
 * person do -- and splitting them into two forms invites the state where a
 * manager has no modules and nobody notices.
 */
function RoleEditor({
  person,
  isSelf,
}: {
  person: {
    userId: string;
    role: Role;
    permissions: ModulePermissions;
    departmentId: string | null;
    jobTitle: string | null;
  };
  isSelf: boolean;
}) {
  const t = useTranslations("People");
  const roles = useTranslations("Roles");
  const router = useRouter();

  const [role, setRole] = useState<Role>(person.role);
  // Seeded from what they already have. Starting empty would look like a form
  // with nothing ticked, and saving it would quietly revoke every module.
  const [permissions, setPermissions] = useState<ModulePermissions>(person.permissions);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await updateMemberRole(person.userId, role, permissions);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(t("saved"));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("editRole")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex max-w-md flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="member-role" className="text-label text-fg-default w-fit">
              {t("role")}
            </label>
            <select
              id="member-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              className={cn(
                "h-9 rounded-control border px-2.5 text-body",
                "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
                focusRing,
                transition,
              )}
            >
              {(["member", "manager", "admin", "owner"] as const).map((option) => (
                <option key={option} value={option}>
                  {roles(option)}
                </option>
              ))}
            </select>
            {isSelf ? (
              <p className="text-caption text-fg-muted">{t("lastOwner")}</p>
            ) : null}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-label text-fg-default mb-1">{t("modules")}</legend>
            {MODULES.map((module) => (
              <label key={module.key} className="text-body text-fg-default flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissions[module.key] === true}
                  onChange={(event) =>
                    setPermissions((previous) => ({
                      ...previous,
                      [module.key]: event.target.checked,
                    }))
                  }
                  className={cn(
                    "accent-accent size-4 rounded-[4px]",
                    focusRing,
                  )}
                />
                {t(module.label)}
              </label>
            ))}
          </fieldset>

          <div aria-live="polite" className="empty:hidden">
            {error ? (
              <p className="text-body text-blocked-text">
                {t(
                  error as
                    | "onlyOwnerCanEditOwner"
                    | "lastOwner"
                    | "notFound"
                    | "invalid",
                )}
              </p>
            ) : message ? (
              <p className="text-body text-complete-text">{message}</p>
            ) : null}
          </div>

          <Button variant="primary" loading={pending} onClick={save} className="w-fit">
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
