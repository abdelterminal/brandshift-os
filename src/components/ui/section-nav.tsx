"use client";
import { useTranslations } from "next-intl";
import { focusRing } from "./styles";
import { cn } from "@/lib/utils";
export function SectionNav({ sections }: { sections: Array<{ id: string; label: string }> }) {
  const t = useTranslations("Ui");
  return <nav aria-label={t("sections")} className="bg-surface-base border-border sticky top-14 z-20 my-5 flex flex-wrap gap-1 border-b py-2">
    {sections.map(section => <a key={section.id} href={`#${section.id}`}
      className={cn("text-label text-fg-muted hover:bg-surface-hover hover:text-fg-default rounded-control px-3 py-2", focusRing)}>
      {section.label}
    </a>)}
  </nav>;
}
