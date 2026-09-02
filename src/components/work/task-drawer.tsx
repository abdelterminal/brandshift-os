"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { clearBlocker, completeTask, reportBlocker, startTask } from "@/lib/actions/tasks";
import type { TaskRow } from "@/lib/data/task-types";

import { STATUS_TONE } from "./task-list";

/**
 * A task, in a side drawer.
 *
 * A drawer and not a modal, on purpose: the list you came from stays visible
 * behind it, so you can see the row you opened, act on it, and close without
 * losing your place. A dialog over the same list hides the context that makes
 * the next decision obvious.
 *
 * Three actions, which are the whole vocabulary of moving work along: Start,
 * Complete, Report blocker. None of them asks for a password -- they are
 * routine writes.
 */
export function TaskDrawer({ task, onClose }: { task: TaskRow | null; onClose: () => void }) {
  const t = useTranslations("Task");
  const statuses = useTranslations("Status");
  const priorities = useTranslations("Priority");
  const format = useFormatter();
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [blockerReason, setBlockerReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!task) return null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "notFound");
        return;
      }
      setBlockerOpen(false);
      setBlockerReason("");
      // The row behind the drawer has changed, so the list has to be re-read.
      router.refresh();
      onClose();
    });
  }

  const isDone = task.status === "done";
  const isBlocked = task.status === "blocked";

  return (
    <Drawer
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{task.title}</DrawerTitle>
          {task.projectName ? (
            <DrawerDescription>
              {task.projectKey} · {task.projectName}
            </DrawerDescription>
          ) : null}
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={STATUS_TONE[task.status]}>{statuses(task.status)}</StatusPill>
            <StatusPill tone="neutral" size="sm">
              {priorities(task.priority)}
            </StatusPill>
          </div>

          {isBlocked && task.blockedReason ? (
            <div className="bg-blocked-bg border-blocked-border rounded-control border p-3">
              <p className="text-label text-blocked-text">{t("blocker")}</p>
              <p className="text-body text-fg-default mt-1">{task.blockedReason}</p>
            </div>
          ) : null}

          {task.description ? (
            <p className="text-body text-fg-muted whitespace-pre-line">{task.description}</p>
          ) : null}

          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-caption text-fg-muted">{t("assignee")}</dt>
              <dd className="text-body text-fg-default mt-1 flex items-center gap-2">
                {task.assigneeName ? (
                  <>
                    <PersonAvatar name={task.assigneeName} size="xs" />
                    {task.assigneeName}
                  </>
                ) : (
                  <span className="text-fg-subtle">{t("unassigned")}</span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-caption text-fg-muted">{t("dueDate")}</dt>
              <dd className="text-body text-fg-default mt-1 tabular-nums">
                {task.dueDate ? (
                  format.dateTime(new Date(`${task.dueDate}T00:00:00`), {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                ) : (
                  <span className="text-fg-subtle">{t("bucketNoDeadline")}</span>
                )}
              </dd>
            </div>

            {task.estimateHours ? (
              <div>
                <dt className="text-caption text-fg-muted">{t("estimate")}</dt>
                <dd className="text-body text-fg-default mt-1 tabular-nums">
                  {t("hours", { hours: Number(task.estimateHours) })}
                </dd>
              </div>
            ) : null}
          </dl>

          {blockerOpen ? (
            <Field>
              <FieldLabel>{t("blocker")}</FieldLabel>
              <Textarea
                autoFocus
                value={blockerReason}
                onChange={(event) => setBlockerReason(event.target.value)}
                placeholder={t("blockerPlaceholder")}
                aria-invalid={error === "blockerReasonRequired" ? true : undefined}
              />
              {error === "blockerReasonRequired" ? (
                <FieldError match>{t("blockerReasonRequired")}</FieldError>
              ) : null}
            </Field>
          ) : null}

          <div aria-live="polite" className="empty:hidden">
            {error && error !== "blockerReasonRequired" ? (
              <p className="text-body text-blocked-text">{t("notFound")}</p>
            ) : null}
          </div>
        </DrawerBody>

        <DrawerFooter>
          {blockerOpen ? (
            <>
              <Button
                variant="primary"
                loading={pending}
                onClick={() => run(() => reportBlocker(task.id, blockerReason))}
              >
                {t("reportBlocker")}
              </Button>
              <Button variant="ghost" onClick={() => setBlockerOpen(false)}>
                {t("closeTask")}
              </Button>
            </>
          ) : (
            <>
              {!isDone ? (
                <Button
                  variant="primary"
                  loading={pending}
                  onClick={() => run(() => completeTask(task.id))}
                >
                  {t("complete")}
                </Button>
              ) : null}

              {!isDone && task.status !== "in_progress" && !isBlocked ? (
                <Button loading={pending} onClick={() => run(() => startTask(task.id))}>
                  {t("start")}
                </Button>
              ) : null}

              {isBlocked ? (
                <Button loading={pending} onClick={() => run(() => clearBlocker(task.id))}>
                  {t("clearBlocker")}
                </Button>
              ) : !isDone ? (
                <Button variant="secondary" onClick={() => setBlockerOpen(true)}>
                  {t("reportBlocker")}
                </Button>
              ) : null}
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
