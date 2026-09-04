import { notFound } from "next/navigation";

import { PrintBar } from "@/components/finance/print-bar";
import { DocumentSheet } from "@/components/finance/sheet";
import { requirePermission } from "@/lib/auth/guards";
import { getInvoice, listInvoiceLines } from "@/lib/data/finance";
import { getLetterhead } from "@/lib/data/organization";

/**
 * The invoice as the client receives it.
 *
 * The same sheet as the quote, and deliberately so -- a client who accepted a
 * devis should recognise the bill that follows it. What differs is what the
 * document is for: an invoice falls due rather than expiring, it carries what
 * has already been paid, and nobody signs it.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/finance/invoices/[invoiceId]/print">) {
  const session = await requirePermission("finance.view");
  const { invoiceId } = await params;
  const invoice = await getInvoice(session.actor, invoiceId);
  return { title: invoice?.number ?? "" };
}

export default async function InvoicePrintPage({
  params,
}: PageProps<"/[locale]/finance/invoices/[invoiceId]/print">) {
  const session = await requirePermission("finance.view");
  const { locale, invoiceId } = await params;

  const invoice = await getInvoice(session.actor, invoiceId);
  if (!invoice) notFound();

  const [lines, letterhead] = await Promise.all([
    listInvoiceLines(session.actor, invoice.id),
    getLetterhead(session.actor),
  ]);

  const at = (day: string) => new Date(`${day}T12:00:00Z`);

  return (
    <>
      <PrintBar
        backHref={`/finance/invoices/${invoice.id}`}
        pdfHref={`/${locale}/finance/invoices/${invoice.id}/pdf`}
      />
      <div className="sheet-scaler pb-10">
        <DocumentSheet
          kind="invoice"
          letterhead={letterhead}
          number={invoice.number}
          title={invoice.title}
          clientName={invoice.companyName}
          issueDate={at(invoice.issueDate)}
          untilDate={invoice.dueDate ? at(invoice.dueDate) : null}
          lines={lines}
          currency={session.organization.currency}
          subtotal={invoice.subtotal}
          tax={invoice.taxTotal}
          total={invoice.total}
          paid={invoice.paidAmount}
          terms={invoice.terms}
        />
      </div>
    </>
  );
}
