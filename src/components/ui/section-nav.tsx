"use client";
import { useTranslations } from "next-intl";
import { focusRing } from "./styles";
import { cn } from "@/lib/utils";
/**
 * `top-0`, not offset for the app header: the header lives outside `<main>`'s
 * own scroll box (see the shell layout), so as far as this nav's sticky
 * positioning is concerned there is nothing above it to clear. `top-14` was
 * right back when the header and the page shared one document-level scroll --
 * left over after that changed, it stuck this nav a header's-height too far
 * down, floating over a gap of bare background instead of sitting flush under
 * the real header.
 */
export function SectionNav({ sections }: { sections: Array<{ id: string; label: string }> }) {
  const t = useTranslations("Ui");
  return <nav aria-label={t("sections")} className="bg-surface-base border-border sticky top-0 z-20 my-5 flex flex-wrap gap-1 border-b py-2">
    {sections.map(section => <a key={section.id} href={`#${section.id}`}
      className={cn("text-label text-fg-muted hover:bg-surface-hover hover:text-fg-default rounded-control px-3 py-2", focusRing)}>
      {section.label}
    </a>)}
  </nav>;
}
