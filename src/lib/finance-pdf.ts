import "server-only";

import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { requirePermission } from "@/lib/auth/guards";
import { withBasePath } from "@/lib/base-path";
import { getInvoice, getQuote } from "@/lib/data/finance";
import { pdfFilename, PdfUnavailableError, renderPagePdf } from "@/lib/pdf";
import { PdfBusyError } from "@/lib/pdf-control";

/**
 * The download behind both `/pdf` routes.
 *
 * Quotes and invoices differ only in which row is fetched and what the file is
 * called, so the order of operations -- which is the part worth getting right
 * -- lives here once:
 *
 * 1. **Check permission first.** Rendering a PDF starts a browser and loads a
 *    page; doing that before knowing the caller may read the document would
 *    let anyone with a URL make this server work.
 * 2. **Check the document exists**, so a bad id is a 404 rather than a browser
 *    launched to render an error page.
 * 3. Only then render, forwarding the caller's own session so the headless
 *    browser sees exactly what they would and nothing more.
 */
export async function financePdfResponse(
  kind: "quote" | "invoice",
  locale: string,
  documentId: string,
): Promise<Response> {
  const session = await requirePermission("finance.view");

  const document =
    kind === "quote"
      ? await getQuote(session.actor, documentId)
      : await getInvoice(session.actor, documentId);

  if (!document) notFound();

  const cookie = (await cookies()).get(SESSION_COOKIE);
  if (!cookie) notFound();

  // Chromium is driven to this app's own route, not through the router --
  // `withBasePath` is what stands in for next/link here.
  const path = withBasePath(`/${locale}/finance/${kind}s/${documentId}/print`);

  try {
    const pdf = await renderPagePdf(path, `${cookie.name}=${cookie.value}`);
    const filename = pdfFilename(kind, document.number, document.companyName ?? "");

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // `attachment` rather than `inline`: somebody who wanted to read it on
        // screen is already on the print view, and pressed a button that says
        // Download.
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "X-Content-Type-Options": "nosniff",
        // A quote can be edited a moment after it is downloaded.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PdfBusyError) {
      return new Response(error.message, {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": "5",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (error instanceof PdfUnavailableError) {
      // No browser on this host. Say so plainly and point at the thing that
      // still works, rather than returning a 500 that reads as data loss --
      // the document is fine, only this one way of getting it is not.
      console.error("[pdf] " + error.message);
      return new Response(
        "PDF rendering is unavailable on this server because no Chromium was found. " +
          "Use the Print button and choose Save as PDF, or set PDF_CHROMIUM_PATH.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    throw error;
  }
}
