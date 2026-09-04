"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * The only thing on the print page that is not the document.
 *
 * `sheet-hide-in-print` takes it off the paper, so what you see in the print
 * preview is exactly the sheet and nothing else. The back link is a real link
 * rather than `history.back()`: somebody may have arrived here from a URL
 * somebody else sent them, and a back button that does nothing is worse than
 * no back button.
 *
 * Download and Print sit side by side because they are genuinely different
 * jobs. Print goes to paper or to the browser's own Save as PDF and needs no
 * server at all. Download asks this server to render the same page with a
 * headless Chromium and hands back a file -- which is the one that can be
 * attached to an email, and the one that fails if the host has no browser.
 * Download is therefore a plain anchor, not a fetch: a 503 lands on a page
 * that explains itself rather than disappearing into an unhandled promise.
 */
export function PrintBar({ backHref, pdfHref }: { backHref: string; pdfHref: string }) {
  const t = useTranslations("Sheet");

  return (
    <div className="sheet-hide-in-print mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-5 py-4">
      <Button variant="ghost" render={<Link href={backHref} />}>
        <ArrowLeft aria-hidden className="size-4" />
        {t("backToDocument")}
      </Button>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          A plain <a>, not next/link: this URL answers with a file rather than
          a page, and routing to it would have the client router try to treat
          a PDF as a navigation.
        */}
        <Button variant="secondary" render={<a href={pdfHref} download />}>
          <Download aria-hidden className="size-4" />
          {t("download")}
        </Button>

        <Button onClick={() => window.print()}>
          <Printer aria-hidden className="size-4" />
          {t("print")}
        </Button>
      </div>
    </div>
  );
}
