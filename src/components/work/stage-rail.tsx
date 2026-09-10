import { getTranslations } from "next-intl/server";

import { PROJECT_STAGES, type ProjectStage } from "@/lib/data/pipeline-stages";
import { cn } from "@/lib/utils";

/**
 * The eight stages as a progress rail.
 *
 * Earlier stages are done, the current one is active, later ones are ahead --
 * the closed tone vocabulary, no red. Read-only: the Stage control below it is
 * how you move.
 */
export async function StageRail({ current }: { current: ProjectStage | null }) {
  const t = await getTranslations("Work");
  const labels = await getTranslations("ProjectStage");

  const currentIndex = current ? PROJECT_STAGES.indexOf(current) : -1;

  return (
    <ol
      aria-label={t("progressRail")}
      className="flex flex-wrap gap-1"
    >
      {PROJECT_STAGES.map((stage, index) => {
        const state =
          currentIndex === -1
            ? "ahead"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "ahead";
        return (
          <li
            key={stage}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "text-caption rounded-control border px-2 py-0.5",
              state === "done" && "border-complete-border bg-complete-bg text-complete-text",
              state === "current" && "border-active-border bg-active-bg text-active-text font-medium",
              state === "ahead" &&
                "border-border bg-surface-sunken text-fg-subtle",
            )}
          >
            {labels(stage)}
          </li>
        );
      })}
    </ol>
  );
}
