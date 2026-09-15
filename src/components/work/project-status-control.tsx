"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { focusRing, transition } from "@/components/ui/styles";
import { setProjectStatus } from "@/lib/actions/projects";
import type { ProjectStatus } from "@/lib/data/projects";
import { cn } from "@/lib/utils";

const STATUSES: ProjectStatus[] = ["planning", "active", "on_hold", "completed", "archived"];

/** The two statuses that end a project's active life, rather than move it along. */
const ENDING_STATUSES = new Set<ProjectStatus>(["archived", "completed"]);

/**
 * The status picker on a project's header.
 *
 * Modeled on `ProjectStageControl` -- a plain select, not a board, since from
 * one project this is setting one value. Unlike the stage control, picking
 * `archived` or `completed` doesn't write immediately: those two end the
 * project's active life (it drops off every open list and board), so they get
 * one inline confirm step first -- no stacked dialog, the same
 * confirm-in-place shape the task drawer already uses for reporting a
 * blocker. `planning`/`active`/`on_hold` stay a single click, same as before.
 */
export function ProjectStatusControl({
  projectId,
  projectName,
  status,
  canSet,
}: {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  canSet: boolean;
}) {
  const t = useTranslations("Work");
  const labels = useTranslations("ProjectStatus");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<ProjectStatus>(status);
  const [confirming, setConfirming] = useState<ProjectStatus | null>(null);

  function apply(next: ProjectStatus) {
    setValue(next);
    startTransition(async () => {
      const result = await setProjectStatus(projectId, next);
      if (!result.ok) {
        setValue(status);
        toast.add({ title: t("setStatusError"), data: { tone: "attention" } });
        setConfirming(null);
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  }

  function choose(next: string) {
    const parsed = next as ProjectStatus;
    if (parsed === value) return;
    if (ENDING_STATUSES.has(parsed)) {
      setConfirming(parsed);
      return;
    }
    apply(parsed);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">
        <span className="sr-only">{t("setStatus")}</span>
        <select
          aria-label={t("setStatus")}
          value={confirming ?? value}
          disabled={!canSet || pending}
          onChange={(event) => choose(event.target.value)}
          className={cn(
            "h-8 rounded-control border px-2 text-body",
            "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
            "disabled:opacity-60",
            focusRing,
            transition,
          )}
        >
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {labels(option)}
            </option>
          ))}
        </select>
      </label>

      {confirming ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-fg-muted">
            {t("setStatusConfirm", { name: projectName, status: labels(confirming) })}
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={() => apply(confirming)}
          >
            {t("setStatusConfirmButton")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>
            {t("setStatusConfirmCancel")}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
