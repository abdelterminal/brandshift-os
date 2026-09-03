import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ConvertQuoteDialog } from "@/components/finance/dialogs";
import { DocumentLines } from "@/components/finance/document";
import { QuoteControls } from "@/components/finance/document-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getQuote, listQuoteLines, type QuoteStatus } from "@/lib/data/finance";
import { cn } from "@/lib/utils";

/**
 * One quote, as the client would read it.
 *
 * The interesting control is at the bottom: an accepted quote becomes a
 * project, and every line becomes a task. That join was the gap CRM left open
 * -- selling the work and doing it were two halves with retyping between them.
 */

export const dynamic = "force-dynamic";

const TONE: Record<QuoteStatus, "neutral" | "active" | "complete" | "blocked" | "attention"> = {
  draft: "neutral",
  sent: "active",
  accepted: "complete",
  declined: "blocked",
  expired: "attention",
};

export async function generateMetadata({ params }: PageProps<"/[locale]/finance/quotes/[quoteId]">) {
  const session = await requirePermission("finance.view");
  const { quoteId } = await params;
  const quote = await getQuote(session.actor, quoteId);
  return { title: quote?.number ?? "" };
}

export default async function QuotePage({ params }: PageProps<"/[locale]/finance/quotes/[quoteId]">) {
  const session = await requirePermission("finance.view");
  const { quoteId } = await params;

  const quote = await getQuote(session.actor, quoteId);
  if (!quote) notFound();

  const [t, statuses, format, lines] = await Promise.all([
    getTranslations("Finance"),
    getTranslations("QuoteStatus"),
    getFormatter(),
    listQuoteLines(session.actor, quote.id),
  ]);

  const currency = session.organization.currency;
  const at = (day: string) => new Date(`${day}T12:00:00Z`);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-fg-subtle tabular-nums">{quote.number}</p>
            <h1 className="text-display font-display text-fg-default mt-0.5">{quote.title}</h1>
            <p className="text-caption text-fg-muted mt-1">
              <Link
                href={`/crm/companies/${quote.companySlug}`}
                className={cn(
                  "text-fg-default rounded-[6px] font-medium underline underline-offset-2",
                  focusRing,
                  transition,
                )}
              >
                {quote.companyName}
              </Link>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[quote.status]}>{statuses(quote.status)}</Badge>
          </div>
        </div>

        {quote.status === "declined" && quote.declineReason ? (
          <p className="text-body text-fg-muted mt-2">{quote.declineReason}</p>
        ) : null}
      </header>

      <dl className="border-border bg-surface-raised mb-6 grid gap-4 rounded-card border p-4 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-fg-muted">{t("issued")}</dt>
          <dd className="text-body text-fg-default mt-0.5 tabular-nums">
            {format.dateTime(at(quote.issueDate), { dateStyle: "long" })}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">{t("validUntil")}</dt>
          <dd
            className={cn(
              "text-body mt-0.5 tabular-nums",
              quote.validUntil ? "text-fg-default" : "text-fg-subtle",
            )}
          >
            {quote.validUntil ? format.dateTime(at(quote.validUntil), { dateStyle: "long" }) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">{t("total")}</dt>
          <dd className="text-body text-fg-default mt-0.5 font-semibold tabular-nums">
            {format.number(quote.total / 100, { style: "currency", currency })}
          </dd>
        </div>
      </dl>

      <section className="mb-6">
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("lines")}</h2>
        <DocumentLines
          lines={lines}
          currency={currency}
          subtotal={quote.subtotal}
          tax={quote.taxTotal}
          total={quote.total}
        />
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <QuoteControls quoteId={quote.id} status={quote.status} />

        {/*
          The handover. Only an accepted quote, and only once -- a second
          project from the same quote would be two records of one engagement.
        */}
        {quote.status === "accepted" && !quote.projectId ? (
          <ConvertQuoteDialog quoteId={quote.id} title={quote.title} />
        ) : null}

        {quote.projectId ? <ConvertedNote projectId={quote.projectId} /> : null}
      </section>
    </div>
  );
}

/** Where an accepted quote ended up. */
async function ConvertedNote({ projectId }: { projectId: string }) {
  const session = await requirePermission("finance.view");
  const [t, projects] = await Promise.all([
    getTranslations("Finance"),
    import("@/lib/data/projects").then((module) => module.listProjects(session.actor)),
  ]);

  const project = projects.find((row) => row.id === projectId);
  if (!project) return null;

  return (
    <Button variant="link" render={<Link href={`/work/${project.key}`} />}>
      {t("convertedTo", { key: `${project.key} · ${project.name}` })}
    </Button>
  );
}
