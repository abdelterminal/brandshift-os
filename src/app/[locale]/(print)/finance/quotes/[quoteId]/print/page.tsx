import { notFound } from "next/navigation";

import { PrintBar } from "@/components/finance/print-bar";
import { DocumentSheet } from "@/components/finance/sheet";
import { requirePermission } from "@/lib/auth/guards";
import { withBasePath } from "@/lib/base-path";
import { getQuote, listQuoteLines } from "@/lib/data/finance";
import { getLetterhead } from "@/lib/data/organization";

/**
 * The quote as the client receives it.
 *
 * A separate route rather than a mode of the quote screen, because the two are
 * different documents: that one is for the person selling the work -- status,
 * the convert-to-project handover, the decline reason -- and this one is for
 * the person being sold to. Its own URL also means it can be sent to somebody.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/finance/quotes/[quoteId]/print">) {
  const session = await requirePermission("finance.view");
  const { quoteId } = await params;
  const quote = await getQuote(session.actor, quoteId);
  return { title: quote?.number ?? "" };
}

export default async function QuotePrintPage({
  params,
}: PageProps<"/[locale]/finance/quotes/[quoteId]/print">) {
  const session = await requirePermission("finance.view");
  const { locale, quoteId } = await params;

  const quote = await getQuote(session.actor, quoteId);
  if (!quote) notFound();

  const [lines, letterhead] = await Promise.all([
    listQuoteLines(session.actor, quote.id),
    getLetterhead(session.actor),
  ]);

  // Midday UTC, so a date-only column does not slide across a day boundary
  // when it is formatted in the reader's zone.
  const at = (day: string) => new Date(`${day}T12:00:00Z`);

  return (
    <>
      <PrintBar
        backHref={`/finance/quotes/${quote.id}`}
        pdfHref={withBasePath(`/${locale}/finance/quotes/${quote.id}/pdf`)}
      />
      <div className="sheet-scaler pb-10">
        <DocumentSheet
          kind="quote"
          letterhead={letterhead}
          number={quote.number}
          title={quote.title}
          clientName={quote.companyName}
          issueDate={at(quote.issueDate)}
          untilDate={quote.validUntil ? at(quote.validUntil) : null}
          lines={lines}
          currency={session.organization.currency}
          subtotal={quote.subtotal}
          tax={quote.taxTotal}
          total={quote.total}
          terms={quote.terms}
        />
      </div>
    </>
  );
}
