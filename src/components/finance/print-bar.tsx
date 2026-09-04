"use client";

import { ArrowLeft, Printer } from "lucide-react";
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
 */
export function PrintBar({ backHref }: { backHref: string }) {
  const t = useTranslations("Sheet");

  return (
    <div className="sheet-hide-in-print mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-5 py-4">
      <Button variant="ghost" render={<Link href={backHref} />}>
        <ArrowLeft aria-hidden className="size-4" />
        {t("backToDocument")}
      </Button>

      <Button onClick={() => window.print()}>
        <Printer aria-hidden className="size-4" />
        {t("print")}
      </Button>
    </div>
  );
}
