"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { focusRing, transition } from "@/components/ui/styles";
import { setProjectStageAction } from "@/lib/actions/pipeline";
import { PROJECT_STAGES, type ProjectStage } from "@/lib/data/pipeline-stages";
import { cn } from "@/lib/utils";

/**
 * The stage picker on a project's header.
 *
 * A plain select, not a board: from one project you are setting one value.
 * Disabled entirely for anyone who may not move it -- the same `can()` answer
 * the pipeline board uses, resolved on the server and passed in.
 */
export function ProjectStageControl({
  projectId,
  stage,
  canSet,
}: {
  projectId: string;
  stage: ProjectStage | null;
  canSet: boolean;
}) {
  const t = useTranslations("Work");
  const labels = useTranslations("ProjectStage");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<string>(stage ?? "");

  function change(next: string) {
    setValue(next);
    startTransition(async () => {
      const result = await setProjectStageAction({
        projectId,
        stage: next === "" ? null : (next as ProjectStage),
      });
      if (!result.ok) {
        setValue(stage ?? "");
        if (result.error !== "alreadyThere") {
          toast.add({ title: t("setStage"), data: { tone: "attention" } });
        }
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-fg-muted text-body">{t("stage")}</span>
      <select
        aria-label={t("setStage")}
        value={value}
        disabled={!canSet || pending}
        onChange={(event) => change(event.target.value)}
        className={cn(
          "h-8 rounded-control border px-2 text-body",
          "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
          "disabled:opacity-60",
          focusRing,
          transition,
        )}
      >
        <option value="">{t("noStage")}</option>
        {PROJECT_STAGES.map((option) => (
          <option key={option} value={option}>
            {labels(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
