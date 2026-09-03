import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { DocumentLines } from "@/components/finance/document";
import { InvoiceControls } from "@/components/finance/document-controls";
import { Badge } from "@/components/ui/badge";
import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { getInvoice, listInvoiceLines, type InvoiceStatus } from "@/lib/data/finance";
import { cn } from "@/lib/utils";

/**
 * One invoice.
 *
 * A voided one keeps its number and stays here with the reason on it: an
 * invoice is never deleted, because a gap in a sequence reads to an auditor as
 * a missing document rather than as a mistake somebody tidied up.
 */

export const dynamic = "force-dynamic";

const TONE: Record<InvoiceStatus, "neutral" | "active" | "attention" | "complete" | "blocked"> = {
  draft: "neutral",
  sent: "active",
  part_paid: "attention",
  paid: "complete",
  void: "blocked",
};

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/finance/invoices/[invoiceId]">) {
  const session = await requirePermission("finance.view");
  const { invoiceId } = await params;
  const invoice = await getInvoice(session.actor, invoiceId);
  return { title: invoice?.number ?? "" };
}

export default async function InvoicePage({
  params,
}: PageProps<"/[locale]/finance/invoices/[invoiceId]">) {
  const session = await requirePermission("finance.view");
  const { invoiceId } = await params;

  const invoice = await getInvoice(session.actor, invoiceId);
  if (!invoice) notFound();

  const [t, statuses, format, lines] = await Promise.all([
    getTranslations("Finance"),
    getTranslations("InvoiceStatus"),
    getFormatter(),
    listInvoiceLines(session.actor, invoice.id),
  ]);

  const currency = session.organization.currency;
  const today = dayKey(new Date(), session.organization.timezone);
  const at = (day: string) => new Date(`${day}T12:00:00Z`);

  const late =
    invoice.dueDate < today &&
    (invoice.status === "sent" || invoice.status === "part_paid");

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-fg-subtle tabular-nums">{invoice.number}</p>
            <h1
              className={cn(
                "text-display font-display mt-0.5",
                invoice.status === "void" ? "text-fg-muted line-through" : "text-fg-default",
              )}
            >
              {invoice.title}
            </h1>
            <p className="text-caption text-fg-muted mt-1 flex flex-wrap items-center gap-x-2">
              <Link
                href={`/crm/companies/${invoice.companySlug}`}
                className={cn(
                  "text-fg-default rounded-[6px] font-medium underline underline-offset-2",
                  focusRing,
                  transition,
                )}
              >
                {invoice.companyName}
              </Link>
              {invoice.projectKey ? (
                <Link
                  href={`/work/${invoice.projectKey}`}
                  className={cn(
                    "text-fg-muted hover:text-fg-default rounded-[6px]",
                    focusRing,
                    transition,
                  )}
                >
                  {invoice.projectKey}
                </Link>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {late ? <Badge tone="blocked">{t("overdue")}</Badge> : null}
            <Badge tone={TONE[invoice.status]}>{statuses(invoice.status)}</Badge>
          </div>
        </div>

        {/* Said in words, not only by a struck-through heading. */}
        {invoice.status === "void" && invoice.voidReason ? (
          <p role="status" className="text-body text-fg-muted mt-2">
            {invoice.voidReason}
          </p>
        ) : null}
      </header>

      <dl className="border-border bg-surface-raised mb-6 grid gap-4 rounded-card border p-4 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-fg-muted">{t("issued")}</dt>
          <dd className="text-body text-fg-default mt-0.5 tabular-nums">
            {format.dateTime(at(invoice.issueDate), { dateStyle: "long" })}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">{t("due")}</dt>
          <dd
            className={cn(
              "text-body mt-0.5 tabular-nums",
              late ? "text-blocked-text font-medium" : "text-fg-default",
            )}
          >
            {format.dateTime(at(invoice.dueDate), { dateStyle: "long" })}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">{t("owed")}</dt>
          <dd className="text-body text-fg-default mt-0.5 font-semibold tabular-nums">
            {format.number((invoice.total - invoice.paidAmount) / 100, {
              style: "currency",
              currency,
            })}
          </dd>
        </div>
      </dl>

      <section className="mb-6">
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("lines")}</h2>
        <DocumentLines
          lines={lines}
          currency={currency}
          subtotal={invoice.subtotal}
          tax={invoice.taxTotal}
          total={invoice.total}
          paid={invoice.paidAmount}
        />
      </section>

      <section>
        <InvoiceControls invoiceId={invoice.id} status={invoice.status} />
      </section>
    </div>
  );
}
