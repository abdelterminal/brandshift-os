import { getTranslations } from "next-intl/server";

import { NewTemplateDialog } from "@/components/templates/controls";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { listDepartments } from "@/lib/data/people";
import { listTemplates } from "@/lib/data/templates";
import { cn } from "@/lib/utils";

/**
 * Templates.
 *
 * No exceptions section here, and that is not an oversight: a template cannot
 * go wrong on its own. Nothing about it is overdue, blocked or at risk -- it
 * simply sits there until somebody starts a project from it. So this is a
 * plain list, alphabetical, with the two facts that tell one from another:
 * how many tasks it makes and how long it runs.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Templates");
  return { title: t("title") };
}

export default async function TemplatesPage() {
  const session = await requirePermission("template.view");

  const [t, templates, departments] = await Promise.all([
    getTranslations("Templates"),
    listTemplates(session.actor),
    listDepartments(session.actor),
  ]);

  const mayManage = can(session.actor, "template.manage");

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
        </div>

        {mayManage ? (
          <NewTemplateDialog
            departments={departments.map((department) => ({
              id: department.id,
              label: department.name,
            }))}
          />
        ) : null}
      </header>

      {templates.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("empty")} description={t("emptyBody")} />
        </div>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                href={`/templates/${template.slug}`}
                className={cn(
                  "hover:bg-surface-hover block px-4 py-3.5",
                  focusRingInset,
                  transition,
                )}
              >
                <p className="text-body text-fg-default font-medium">{template.name}</p>
                <p className="text-caption text-fg-muted mt-0.5">
                  {[
                    t("taskCount", { count: template.tasks.length }),
                    template.spanDays === null
                      ? t("noSpan")
                      : t("span", { days: template.spanDays }),
                    template.departmentName ?? t("wholeCompany"),
                  ].join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
