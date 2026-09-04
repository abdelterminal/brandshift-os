import { financePdfResponse } from "@/lib/finance-pdf";

/** The quote as a PDF file. See `financePdfResponse` for the order of checks. */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; quoteId: string }> },
) {
  const { locale, quoteId } = await params;
  return financePdfResponse("quote", locale, quoteId);
}
