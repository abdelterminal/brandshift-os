import { getTranslations } from "next-intl/server";

import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * List / Pipeline, on the two Work views.
 *
 * `/work` is the list -- late projects, stuck work -- and `/work/pipeline` is
 * the board by stage. Same pair of routes on both pages so the toggle sits
 * still while the content behind it changes, the call CRM already makes
 * between its own list and board.
 */
export async function WorkViewToggle({ current }: { current: "list" | "pipeline" }) {
  const t = await getTranslations("Work");

  const options = [
    { value: "list", label: t("listView"), href: "/work" as const },
    { value: "pipeline", label: t("pipelineView"), href: "/work/pipeline" as const },
  ];

  return (
    <div
      role="group"
      aria-label={t("listView")}
      className="border-border bg-surface-sunken inline-flex items-center gap-0.5 rounded-control border p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "text-label rounded-[6px] px-2.5 py-1",
              focusRing,
              transition,
              selected
                ? "bg-surface-raised text-fg-default font-semibold"
                : "text-fg-muted hover:text-fg-default",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
