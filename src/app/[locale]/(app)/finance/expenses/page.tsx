import { getFormatter, getTranslations } from "next-intl/server";

import { NewExpenseDialog } from "@/components/finance/dialogs";
import { ReimburseButton } from "@/components/finance/document-controls";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { requirePermission } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { listExpenses } from "@/lib/data/finance";
import { listProjects } from "@/lib/data/projects";

/**
 * Money out.
 *
 * Flat and quick to file: an expense is a receipt somebody is holding, not a
 * document with lines. What it is, what it cost, when, and whether anybody is
 * out of pocket -- that last one is the only part with an action attached.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Finance");
  return { title: t("expenses") };
}

export default async function ExpensesPage() {
  const session = await requirePermission("finance.view");
  const today = dayKey(new Date(), session.organization.timezone);

  const [t, categories, format, expenses, projects] = await Promise.all([
    getTranslations("Finance"),
    getTranslations("ExpenseCategory"),
    getFormatter(),
    listExpenses(session.actor),
    listProjects(session.actor),
  ]);

  const currency = session.organization.currency;
  const owing = expenses.filter(
    (expense) => expense.reimbursable && expense.reimbursedAt === null,
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("expenses")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("expensesSubtitle")}</p>
        </div>
        <NewExpenseDialog
          projects={projects.map((project) => ({
            id: project.id,
            label: `${project.key} · ${project.name}`,
          }))}
          today={today}
        />
      </header>

      {/* The only figure here, and it is money somebody is personally out. */}
      {owing.length > 0 ? (
        <p className="text-body text-fg-muted mb-6 tabular-nums">
          {t("owing")}:{" "}
          <span className="text-fg-default font-semibold">
            {format.number(
              owing.reduce((total, expense) => total + expense.amount, 0) / 100,
              { style: "currency", currency },
            )}
          </span>
        </p>
      ) : null}

      {expenses.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("noExpenses")} description={t("noExpensesBody")} />
        </div>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
          {expenses.map((expense) => (
            <li key={expense.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="text-body text-fg-default block">{expense.description}</span>
                <span className="text-caption text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-2 tabular-nums">
                  <span>
                    {format.dateTime(new Date(`${expense.spentOn}T12:00:00Z`), {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span>{categories(expense.category)}</span>
                  {expense.supplier ? <span>{expense.supplier}</span> : null}
                  {expense.projectKey ? <span>{expense.projectKey}</span> : null}
                </span>
              </span>

              {expense.paidByName ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <PersonAvatar name={expense.paidByName} size="xs" />
                  <span className="text-caption text-fg-muted hidden sm:inline">
                    {expense.paidByName}
                  </span>
                </span>
              ) : null}

              <span className="text-body text-fg-default shrink-0 tabular-nums">
                {format.number(expense.amount / 100, { style: "currency", currency })}
              </span>

              {expense.reimbursable && expense.reimbursedAt === null ? (
                <ReimburseButton expenseId={expense.id} />
              ) : expense.reimbursedAt ? (
                <Badge tone="complete" size="sm" className="shrink-0">
                  {t("reimbursed")}
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
