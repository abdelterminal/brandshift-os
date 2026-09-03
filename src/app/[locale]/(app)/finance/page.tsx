import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { financeSummary, type InvoiceRow } from "@/lib/data/finance";
import { cn } from "@/lib/utils";

/**
 * Finance.
 *
 * Opens with what needs doing, like every other screen in this app: overdue
 * invoices first, then what is merely awaiting payment. The figures underneath
 * are sums of real documents -- no run rate, no projection, nothing modelled.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Finance");
  return { title: t("title") };
}

export default async function FinancePage() {
  const session = await requirePermission("finance.view");

  const currency = session.organization.currency;
  const today = dayKey(new Date(), session.organization.timezone);

  const [t, format, summary] = await Promise.all([
    getTranslations("Finance"),
    getFormatter(),
    financeSummary(session.actor, today),
  ]);

  const money = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency, maximumFractionDigits: 0 });

  const nothingToDo =
    summary.overdue.length === 0 &&
    summary.awaiting.length === 0 &&
    summary.quotesOut.length === 0 &&
    summary.toReimburse.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="link" render={<Link href="/finance/quotes" />}>
            {t("quotes")}
          </Button>
          <Button variant="link" render={<Link href="/finance/invoices" />}>
            {t("invoices")}
          </Button>
          <Button variant="link" render={<Link href="/finance/expenses" />}>
            {t("expenses")}
          </Button>
        </div>
      </header>

      {nothingToDo ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("allSettled")} description={t("allSettledBody")} />
        </div>
      ) : (
        <>
          <dl className="border-border bg-surface-raised mb-8 grid grid-cols-2 gap-4 rounded-card border p-4 sm:grid-cols-4">
            {(
              [
                ["outstanding", money(summary.outstanding), true],
                ["overdueValue", money(summary.overdueValue), summary.overdueValue > 0],
                ["quotesOut", String(summary.quotesOut.length), false],
                ["toReimburse", String(summary.toReimburse.length), false],
              ] as const
            ).map(([key, value, strong]) => (
              <div key={key}>
                <dt className="text-caption text-fg-muted">{t(key)}</dt>
                <dd
                  className={cn(
                    "text-heading font-display mt-0.5 tabular-nums",
                    key === "overdueValue" && summary.overdueValue > 0
                      ? "text-blocked-text"
                      : strong
                        ? "text-fg-default"
                        : "text-fg-muted",
                  )}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <InvoiceSection
            heading={t("overdue")}
            body={t("overdueBody")}
            invoices={summary.overdue}
            currency={currency}
            emptyTitle={t("nothingOverdue")}
            emptyBody={t("nothingOverdueBody")}
            late
          />

          <div className="mt-8">
            <InvoiceSection
              heading={t("awaiting")}
              body={t("awaitingBody")}
              invoices={summary.awaiting}
              currency={currency}
            />
          </div>
        </>
      )}
    </div>
  );
}

async function InvoiceSection({
  heading,
  body,
  invoices,
  currency,
  emptyTitle,
  emptyBody,
  late = false,
}: {
  heading: string;
  body: string;
  invoices: InvoiceRow[];
  currency: string;
  emptyTitle?: string;
  emptyBody?: string;
  late?: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations("Finance"), getFormatter()]);

  if (invoices.length === 0 && !emptyTitle) return null;

  return (
    <section>
      <h2 className="text-heading font-display text-fg-default mb-1">{heading}</h2>
      <p className="text-caption text-fg-muted mb-2">{body}</p>

      {invoices.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={emptyTitle!} description={emptyBody!} />
        </div>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
          {invoices.map((invoice) => (
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
                  <span className="text-body text-fg-default block font-medium">
                    {invoice.number} · {invoice.title}
                  </span>
                  <span className="text-caption text-fg-subtle mt-0.5 block truncate">
                    {invoice.companyName}
                  </span>
                </span>

                <span className="text-body text-fg-default shrink-0 tabular-nums">
                  {format.number((invoice.total - invoice.paidAmount) / 100, {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 0,
                  })}
                </span>

                <Badge tone={late ? "blocked" : "attention"} size="sm" className="shrink-0">
                  {t("dueOn", {
                    date: format.dateTime(new Date(`${invoice.dueDate}T12:00:00Z`), {
                      day: "numeric",
                      month: "short",
                    }),
                  })}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
