import { financePdfResponse } from "@/lib/finance-pdf";

/** The invoice as a PDF file. See `financePdfResponse` for the order of checks. */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; invoiceId: string }> },
) {
  const { locale, invoiceId } = await params;
  return financePdfResponse("invoice", locale, invoiceId);
}
