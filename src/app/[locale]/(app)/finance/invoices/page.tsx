import { getFormatter, getTranslations } from "next-intl/server";

import { NewInvoiceDialog } from "@/components/finance/dialogs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { addDays, dayKey } from "@/lib/calendar-dates";
import { listCompanies } from "@/lib/data/crm";
import { listInvoices, type InvoiceStatus } from "@/lib/data/finance";
import { listProjects } from "@/lib/data/projects";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TONE: Record<InvoiceStatus, "neutral" | "active" | "attention" | "complete" | "blocked"> = {
  draft: "neutral",
  sent: "active",
  part_paid: "attention",
  paid: "complete",
  void: "blocked",
};

export async function generateMetadata() {
  const t = await getTranslations("Finance");
  return { title: t("invoices") };
}

export default async function InvoicesPage() {
  const session = await requirePermission("finance.view");
  const today = dayKey(new Date(), session.organization.timezone);

  const [t, statuses, format, invoices, companies, projects] = await Promise.all([
    getTranslations("Finance"),
    getTranslations("InvoiceStatus"),
    getFormatter(),
    listInvoices(session.actor),
    listCompanies(session.actor),
    listProjects(session.actor),
  ]);

  const currency = session.organization.currency;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("invoices")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("invoicesSubtitle")}</p>
        </div>
        <NewInvoiceDialog
          companies={companies.map((company) => ({ id: company.id, label: company.name }))}
          projects={projects.map((project) => ({
            id: project.id,
            label: `${project.key} · ${project.name}`,
          }))}
          currency={currency}
          today={today}
          // Thirty days: what most terms say, and what nobody wants to retype.
          dueDefault={addDays(today, 30)}
        />
      </header>

      {invoices.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("noInvoices")} description={t("noInvoicesBody")} />
        </div>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
          {invoices.map((invoice) => {
            const late =
              invoice.dueDate < today &&
              (invoice.status === "sent" || invoice.status === "part_paid");

            return (
              <li key={invoice.id}>
                <Link
                  href={`/finance/invoices/${invoice.id}`}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-4 py-3",
                    "hover:bg-surface-hover",
                    focusRingInset,
                    transition,
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "text-body block font-medium",
                        invoice.status === "void"
                          ? "text-fg-muted line-through"
                          : "text-fg-default",
                      )}
                    >
                      {invoice.number} · {invoice.title}
                    </span>
                    <span className="text-caption text-fg-subtle mt-0.5 block truncate">
                      {[invoice.companyName, invoice.projectKey].filter(Boolean).join(" · ")}
                    </span>
                  </span>

                  <span className="text-body text-fg-default shrink-0 tabular-nums">
                    {format.number(invoice.total / 100, {
                      style: "currency",
                      currency,
                      maximumFractionDigits: 0,
                    })}
                  </span>

                  {late ? (
                    <Badge tone="blocked" size="sm" className="shrink-0">
                      {t("overdue")}
                    </Badge>
                  ) : null}

                  <Badge tone={TONE[invoice.status]} size="sm" className="shrink-0">
                    {statuses(invoice.status)}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
