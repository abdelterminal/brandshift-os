"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setUpStageAction } from "@/lib/actions/playbook";
import type { ProjectStage } from "@/lib/data/pipeline-stages";

/**
 * "Set up this stage."
 *
 * Shown only when the current stage has a playbook and has not been set up for
 * this project yet -- the button is the whole interaction, and it disappears
 * once done (a done note takes its place). Idempotent underneath: a second
 * click is refused by the `project_stage_setup` row, so nothing duplicates.
 */
export function StageSetupButton({
  projectId,
  stage,
  configured,
  alreadySetUp,
  canSetUp,
}: {
  projectId: string;
  stage: ProjectStage;
  configured: boolean;
  alreadySetUp: boolean;
  canSetUp: boolean;
}) {
  const t = useTranslations("Work");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  if (alreadySetUp) {
    return (
      <p className="text-caption text-fg-muted inline-flex items-center gap-1.5">
        <Check className="text-complete-text size-3.5" aria-hidden />
        {t("stageAlreadySetUp")}
      </p>
    );
  }

  if (!configured || !canSetUp) return null;

  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setUpStageAction({ projectId, stage });
          if (!result.ok) {
            toast.add({
              title: result.error === "notConfigured" ? t("stageNotConfigured") : t("setUpStage"),
              data: { tone: "attention" },
            });
            return;
          }
          toast.add({ title: t("setUpStage") });
          router.refresh();
        })
      }
    >
      {t("setUpStage")}
    </Button>
  );
}
