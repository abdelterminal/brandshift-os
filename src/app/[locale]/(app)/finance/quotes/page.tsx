import { getFormatter, getTranslations } from "next-intl/server";

import { NewQuoteDialog } from "@/components/finance/dialogs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { listCompanies } from "@/lib/data/crm";
import { listQuotes, type QuoteStatus } from "@/lib/data/finance";
import { cn } from "@/lib/utils";

/** Quotes, newest number first -- which is also newest first. */
export const dynamic = "force-dynamic";

const TONE: Record<QuoteStatus, "neutral" | "active" | "complete" | "blocked" | "attention"> = {
  draft: "neutral",
  sent: "active",
  accepted: "complete",
  declined: "blocked",
  expired: "attention",
};

export async function generateMetadata() {
  const t = await getTranslations("Finance");
  return { title: t("quotes") };
}

export default async function QuotesPage() {
  const session = await requirePermission("finance.view");
  const today = dayKey(new Date(), session.organization.timezone);

  const [t, statuses, format, quotes, companies] = await Promise.all([
    getTranslations("Finance"),
    getTranslations("QuoteStatus"),
    getFormatter(),
    listQuotes(session.actor),
    listCompanies(session.actor),
  ]);

  const currency = session.organization.currency;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("quotes")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("quotesSubtitle")}</p>
        </div>
        <NewQuoteDialog
          companies={companies.map((company) => ({ id: company.id, label: company.name }))}
          currency={currency}
          today={today}
        />
      </header>

      {quotes.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("noQuotes")} description={t("noQuotesBody")} />
        </div>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link
                href={`/finance/quotes/${quote.id}`}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-3",
                  "hover:bg-surface-hover",
                  focusRingInset,
                  transition,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-body text-fg-default block font-medium">
                    {quote.number} · {quote.title}
                  </span>
                  <span className="text-caption text-fg-subtle mt-0.5 block truncate">
                    {quote.companyName}
                  </span>
                </span>

                <span className="text-body text-fg-default shrink-0 tabular-nums">
                  {format.number(quote.total / 100, {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 0,
                  })}
                </span>

                <Badge tone={TONE[quote.status]} size="sm" className="shrink-0">
                  {statuses(quote.status)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
