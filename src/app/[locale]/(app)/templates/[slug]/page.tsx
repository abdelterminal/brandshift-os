import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  EditTasksDialog,
  RetireTemplateButton,
  StartProjectDialog,
} from "@/components/templates/controls";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { dayKey } from "@/lib/calendar-dates";
import { getTemplate } from "@/lib/data/templates";

/**
 * One template.
 *
 * Reads as the running order it is: task, priority, and which day of the
 * project it falls on. The day number rather than a date, because a template
 * has no calendar of its own -- it acquires one the moment somebody starts a
 * project and says when that project begins.
 */
export const dynamic = "force-dynamic";

const PRIORITY_KEY = {
  low: "priorityLow",
  medium: "priorityMedium",
  high: "priorityHigh",
  urgent: "priorityUrgent",
} as const;

const PRIORITY_TONE = {
  low: "neutral",
  medium: "neutral",
  high: "attention",
  urgent: "attention",
} as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePermission("template.view");
  const template = await getTemplate(session.actor, slug);
  return { title: template?.name ?? "" };
}

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePermission("template.view");

  const template = await getTemplate(session.actor, slug);
  if (!template) notFound();

  const t = await getTranslations("Templates");
  const today = dayKey(new Date(), session.organization.timezone);

  const mayManage = can(session.actor, "template.manage");
  const mayStart = can(session.actor, "project.create");

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{template.name}</h1>
          <p className="text-caption text-fg-muted mt-1.5">
            {[
              t("taskCount", { count: template.tasks.length }),
              template.spanDays === null ? t("noSpan") : t("span", { days: template.spanDays }),
              template.departmentName ?? t("wholeCompany"),
            ].join(" · ")}
          </p>
        </div>

        {mayStart ? (
          <StartProjectDialog templateId={template.id} templateName={template.name} today={today} />
        ) : null}
      </header>

      {template.description ? (
        <p className="text-body text-fg-default mb-6">{template.description}</p>
      ) : null}

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-heading text-fg-default">{t("tasks")}</h2>
          {mayManage ? (
            <EditTasksDialog
              templateId={template.id}
              initialTasks={template.tasks.map((task) => ({
                title: task.title,
                description: task.description,
                priority: task.priority,
                offsetDays: task.offsetDays,
              }))}
            />
          ) : null}
        </div>

        {template.tasks.length === 0 ? (
          <p className="text-body text-fg-muted">{t("noTasks")}</p>
        ) : (
          <ol className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {template.tasks.map((task, index) => (
              <li key={task.id} className="flex gap-3 px-4 py-3">
                <span
                  className="text-caption text-fg-muted mt-0.5 shrink-0 tabular-nums"
                  aria-hidden
                >
                  {index + 1}.
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-default">{task.title}</p>
                  {task.description ? (
                    <p className="text-caption text-fg-muted mt-1">{task.description}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-start gap-2">
                  <Badge tone={PRIORITY_TONE[task.priority]}>
                    {t(PRIORITY_KEY[task.priority])}
                  </Badge>
                  <span className="text-caption text-fg-muted mt-1 tabular-nums">
                    {task.offsetDays === null
                      ? t("noDeadline")
                      : t("dayNumber", { days: task.offsetDays })}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {mayManage ? (
        <section className="flex justify-end">
          <RetireTemplateButton templateId={template.id} />
        </section>
      ) : null}
    </div>
  );
}
