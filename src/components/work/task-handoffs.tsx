"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import {
  linkChoicesFor,
  linkTask,
  nudgeLink,
  taskLinksFor,
  unlinkTask,
} from "@/lib/actions/task-links";
import type { LinkedTask } from "@/lib/data/task-links";
import type { TaskChoice } from "@/lib/data/task-links";
import { cn } from "@/lib/utils";

import { STATUS_TONE } from "./task-list";

/**
 * The handoff, in the task drawer.
 *
 * "Waiting on" is what this task needs first; "Blocks" is what is waiting on
 * it. Each linked task is a title, a status and a name -- the whole of what a
 * member is allowed to see across the wall. When the thing you are waiting on
 * is not done yet, Nudge tells whoever holds it that you are stuck behind it.
 */
export function TaskHandoffs({
  taskId,
  canWork,
  onChanged,
}: {
  taskId: string;
  canWork: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("Handoff");
  const statuses = useTranslations("Status");

  const [links, setLinks] = useState<{ upstream: LinkedTask[]; downstream: LinkedTask[] } | null>(
    null,
  );
  const [adding, setAdding] = useState(false);
  const [choices, setChoices] = useState<TaskChoice[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const result = await taskLinksFor(taskId);
    setLinks(result.ok ? result.data! : { upstream: [], downstream: [] });
  }

  // The drawer passes `key={task.id}`, so this mounts fresh per task and only
  // has to fetch -- no state to reset.
  useEffect(() => {
    let cancelled = false;
    taskLinksFor(taskId).then((result) => {
      if (!cancelled) setLinks(result.ok ? result.data! : { upstream: [], downstream: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setNotice(t(`error.${result.error ?? "generic"}` as "error.generic"));
        return;
      }
      if (ok) setNotice(t(ok as "nudged"));
      await reload();
      onChanged();
    });
  }

  function openAdd() {
    setAdding(true);
    setChoices(null);
    void linkChoicesFor(taskId).then((result) => setChoices(result.ok ? result.data! : []));
  }

  if (links === null) return null;

  const nothing = links.upstream.length === 0 && links.downstream.length === 0;

  return (
    <section className="border-border rounded-control border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-label text-fg-default">{t("title")}</h3>
        {canWork && !adding ? (
          <Button size="sm" variant="ghost" onClick={openAdd}>
            {t("add")}
          </Button>
        ) : null}
      </div>

      {nothing && !adding ? <p className="text-caption text-fg-muted mt-1">{t("none")}</p> : null}

      {links.upstream.length > 0 ? (
        <div className="mt-3">
          <p className="text-caption text-fg-muted">{t("waitingOn")}</p>
          <ul className="mt-1 space-y-2">
            {links.upstream.map((link) => (
              <li key={link.linkId} className="flex flex-wrap items-center gap-2">
                <span className="text-body text-fg-default">{link.title}</span>
                <StatusPill tone={STATUS_TONE[link.status]} size="sm">
                  {statuses(link.status)}
                </StatusPill>
                <span className="text-caption text-fg-muted">
                  {link.assigneeName ?? t("unassigned")}
                </span>
                {canWork && link.status !== "done" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={pending}
                    onClick={() => act(() => nudgeLink(link.linkId), "nudged")}
                  >
                    {t("nudge")}
                  </Button>
                ) : null}
                {canWork ? (
                  <button
                    type="button"
                    onClick={() => act(() => unlinkTask(link.linkId))}
                    className={cn(
                      "text-caption text-fg-subtle hover:text-fg-default rounded-[4px]",
                      focusRing,
                      transition,
                    )}
                  >
                    {t("remove")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {links.downstream.length > 0 ? (
        <div className="mt-3">
          <p className="text-caption text-fg-muted">{t("blocks")}</p>
          <ul className="mt-1 space-y-1">
            {links.downstream.map((link) => (
              <li key={link.linkId} className="text-body text-fg-default flex flex-wrap gap-2">
                {link.title}
                <span className="text-caption text-fg-muted">
                  {link.assigneeName ?? t("unassigned")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {adding ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="handoff-pick" className="text-caption text-fg-muted">
            {t("waitingOn")}
          </label>
          <select
            id="handoff-pick"
            disabled={pending || choices === null}
            defaultValue=""
            onChange={(event) => {
              const blockingTaskId = event.target.value;
              if (!blockingTaskId) return;
              act(() => linkTask({ blockedTaskId: taskId, blockingTaskId }));
              setAdding(false);
            }}
            className={cn(
              "text-body bg-surface-raised border-border-control rounded-control h-9 border px-2.5",
              focusRing,
              transition,
            )}
          >
            <option value="" disabled>
              {choices === null ? t("loading") : t("pick")}
            </option>
            {(choices ?? []).map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title}
                {choice.assigneeName ? ` — ${choice.assigneeName}` : ""}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            {t("cancel")}
          </Button>
        </div>
      ) : null}

      {notice ? (
        <p className="text-caption text-fg-muted mt-2" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
