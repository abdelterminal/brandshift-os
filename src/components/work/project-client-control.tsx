"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { focusRing, transition } from "@/components/ui/styles";
import { setProjectClient } from "@/lib/actions/projects";
import { cn } from "@/lib/utils";

/**
 * The client picker on a project's header.
 *
 * Modeled on `ProjectStatusControl` -- a plain select, one value, no
 * stacked dialog. Unlike status, no value here ever ends anything, so
 * there's no confirm step: picking a client, changing it, or clearing it
 * back to "no client" all write immediately.
 */
export function ProjectClientControl({
  projectId,
  companyId,
  companies,
  canSet,
}: {
  projectId: string;
  companyId: string | null;
  companies: Array<{ id: string; name: string }>;
  canSet: boolean;
}) {
  const t = useTranslations("Work");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(companyId ?? "");

  function change(next: string) {
    setValue(next);
    startTransition(async () => {
      const result = await setProjectClient(projectId, next);
      if (!result.ok) {
        setValue(companyId ?? "");
        toast.add({ title: t("setClientError"), data: { tone: "attention" } });
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{t("setClient")}</span>
      <select
        aria-label={t("setClient")}
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
        <option value="">{t("noClientOption")}</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    </label>
  );
}
