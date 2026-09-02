import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/ui/feedback";

/**
 * A screen the shell can reach but that is not built yet.
 *
 * It says so plainly rather than showing an empty list that looks broken, or
 * inventing numbers to fill the space. Every one of these disappears as its
 * milestone lands.
 */
export async function PagePlaceholder({ title }: { title: string }) {
  const t = await getTranslations("Placeholder");

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <h1 className="text-display font-display text-fg-default">{title}</h1>
      <div className="border-border rounded-card mt-6 border">
        <EmptyState title={t("comingSoon")} description={t("comingSoonBody")} />
      </div>
    </div>
  );
}
