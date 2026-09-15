"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
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
import { Input, Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import {
  assignTask,
  cancelTask,
  clearBlocker,
  completeTask,
  reportBlocker,
  startTask,
  updateTaskDetails,
} from "@/lib/actions/tasks";
import type { AssignablePerson, TaskPriority, TaskRow } from "@/lib/data/task-types";
import { cn } from "@/lib/utils";

import { STATUS_TONE } from "./task-list";
import { TaskHandoffs } from "./task-handoffs";

type ComboboxOption = { value: string; label: string };

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
 * routine writes. They are shown only to someone who may actually make them
 * -- the task's assignee, a lead/contributor on its project, or a manager
 * (`viewer.isManager` / `task.assigneeUserId` / `viewer.projectIds` +
 * `mayWorkOn` on the server). Everyone else sees the drawer read-only: the
 * status, the blocker, the description, but no buttons.
 *
 * Reassigning is a separate, narrower call: unlike the three above, only a
 * manager may make it, whether or not they are otherwise connected to the
 * task -- see `assignTask`'s own doc. Unlike the other three it also does not
 * close the drawer on success, since picking a different person is not "done
 * with this task" the way completing it is. Everyone who is not a manager
 * sees a plain-text assignee instead of the picker, with a note when they can
 * otherwise work the task, so the lock reads as deliberate.
 */
export type TaskDrawerViewer = {
  userId: string;
  isManager: boolean;
  /** Projects the viewer is a non-`viewer` member of. */
  projectIds: string[];
};

export function TaskDrawer({
  task,
  assignablePeople,
  viewer,
  onClose,
}: {
  task: TaskRow | null;
  /** Everyone who can be assigned work -- `listAssignablePeople()`, org-wide. */
  assignablePeople: AssignablePerson[];
  viewer: TaskDrawerViewer;
  onClose: () => void;
}) {
  const t = useTranslations("Task");
  const statuses = useTranslations("Status");
  const priorities = useTranslations("Priority");
  const format = useFormatter();
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [blockerReason, setBlockerReason] = useState("");
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignPending, startAssignTransition] = useTransition();
  const [assignError, setAssignError] = useState<string | null>(null);

  const [detailsEditing, setDetailsEditing] = useState(false);
  const [detailsPending, startDetailsTransition] = useTransition();
  const [detailsError, setDetailsError] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");

  if (!task) return null;

  const startEditingDetails = () => {
    setDetailsError(false);
    setEditDescription(task.description ?? "");
    setEditDueDate(task.dueDate ?? "");
    setEditPriority(task.priority);
    setDetailsEditing(true);
  };

  const saveDetails = () => {
    setDetailsError(false);
    startDetailsTransition(async () => {
      const result = await updateTaskDetails({
        taskId: task.id,
        description: editDescription,
        dueDate: editDueDate,
        priority: editPriority,
      });
      if (!result.ok) {
        setDetailsError(true);
        return;
      }
      setDetailsEditing(false);
      router.refresh();
    });
  };

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
      setCancelConfirming(false);
      // The row behind the drawer has changed, so the list has to be re-read.
      router.refresh();
      onClose();
    });
  }

  const assign = (userId: string | null) => {
    setAssignError(null);
    startAssignTransition(async () => {
      const result = await assignTask(task.id, userId ?? "");
      if (!result.ok) {
        setAssignError(result.error ?? "notFound");
        return;
      }
      // Unlike `run()`, no `onClose()` -- reassigning isn't "done with this
      // task" the way completing or blocking it is.
      router.refresh();
    });
  };

  const isDone = task.status === "done";
  const isCancelled = task.status === "cancelled";
  const isBlocked = task.status === "blocked";
  const canWork =
    viewer.isManager ||
    task.assigneeUserId === viewer.userId ||
    (task.projectId != null && viewer.projectIds.includes(task.projectId));
  // Cancelling is narrower than working the task -- the same "a bigger call
  // than doing it" reasoning `assignTask` uses -- except for a person's own
  // personal to-do, which needs nobody's permission to drop.
  const canCancel =
    !isDone &&
    !isCancelled &&
    (viewer.isManager ||
      (task.projectId === null && task.assigneeUserId === viewer.userId));
  const assigneeOptions: ComboboxOption[] = assignablePeople.map((person) => ({
    value: person.userId,
    label: person.name,
  }));
  // Built from the task's own fields rather than looked up in
  // `assignablePeople`, so an assignee who is no longer assignable (left the
  // org, went inactive) still shows by name instead of silently reading as
  // unassigned.
  const currentAssignee: ComboboxOption | null = task.assigneeUserId
    ? { value: task.assigneeUserId, label: task.assigneeName ?? "" }
    : null;

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

          {detailsEditing ? (
            <div className="space-y-4">
              <Field>
                <FieldLabel>{t("description")}</FieldLabel>
                <Textarea
                  autoFocus
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder={t("descriptionPlaceholder")}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>{t("dueDate")}</FieldLabel>
                  <Input
                    type="date"
                    value={editDueDate}
                    onChange={(event) => setEditDueDate(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("priority")}</FieldLabel>
                  <select
                    aria-label={t("priority")}
                    value={editPriority}
                    onChange={(event) => setEditPriority(event.target.value as TaskPriority)}
                    className={cn(
                      "h-9 w-full rounded-control border px-3 text-body",
                      "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
                      focusRing,
                      transition,
                    )}
                  >
                    <option value="low">{priorities("low")}</option>
                    <option value="medium">{priorities("medium")}</option>
                    <option value="high">{priorities("high")}</option>
                    <option value="urgent">{priorities("urgent")}</option>
                  </select>
                </Field>
              </div>

              {detailsError ? <p className="text-body text-blocked-text">{t("notFound")}</p> : null}

              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" loading={detailsPending} onClick={saveDetails}>
                  {t("saveDetails")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={detailsPending}
                  onClick={() => setDetailsEditing(false)}
                >
                  {t("closeTask")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {task.description ? (
                <p className="text-body text-fg-muted whitespace-pre-line">{task.description}</p>
              ) : canWork ? (
                <p className="text-body text-fg-subtle italic">{t("noDescription")}</p>
              ) : null}
              {canWork ? (
                <Button size="sm" variant="ghost" onClick={startEditingDetails}>
                  {t("editDetails")}
                </Button>
              ) : null}
            </div>
          )}

          {/*
            Reassigning is narrower than everything else here: `canWork`
            covers doing the task, but deciding who it belongs to is a
            manager's call, whoever is holding it today. Someone who can
            work the task but not reassign it still sees the picker as a
            plain read-only value, with a line saying why -- otherwise the
            buttons below being active and this field being locked reads as
            inconsistent rather than deliberate.
          */}
          {viewer.isManager ? (
            <Field>
              <FieldLabel>{t("assignee")}</FieldLabel>
              <Combobox
                items={assigneeOptions}
                value={currentAssignee}
                onValueChange={(selected) => assign(selected ? selected.value : null)}
              >
                <ComboboxInput
                  placeholder={t("unassigned")}
                  disabled={assignPending}
                  clearLabel={t("assigneeClear")}
                  openLabel={t("assigneeOpen")}
                />
                <ComboboxContent emptyMessage={t("assigneeEmpty")}>
                  <ComboboxList>
                    {(item: ComboboxOption) => (
                      <ComboboxItem key={item.value} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {assignError ? <FieldError match>{t("notFound")}</FieldError> : null}
            </Field>
          ) : (
            <div>
              <dt className="text-caption text-fg-muted">{t("assignee")}</dt>
              <dd className="text-body text-fg-default mt-1">
                {task.assigneeName ?? t("unassigned")}
              </dd>
              {canWork ? (
                <p className="text-caption text-fg-muted mt-1">{t("assigneeManagerOnly")}</p>
              ) : null}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-4 empty:hidden">
            {/* Shown as an editable field above instead, while editing --
                not repeated here read-only at the same time. */}
            {!detailsEditing ? (
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
            ) : null}

            {task.estimateHours ? (
              <div>
                <dt className="text-caption text-fg-muted">{t("estimate")}</dt>
                <dd className="text-body text-fg-default mt-1 tabular-nums">
                  {t("hours", { hours: Number(task.estimateHours) })}
                </dd>
              </div>
            ) : null}
          </dl>

          <TaskHandoffs
            key={task.id}
            taskId={task.id}
            canWork={canWork}
            onChanged={() => router.refresh()}
          />

          {blockerOpen ? (
            <Field>
              <FieldLabel>{t("blocker")}</FieldLabel>
              <Textarea
                required
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
          {!canWork ? (
            <p className="text-caption text-fg-muted">{t("workRestricted")}</p>
          ) : blockerOpen ? (
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
          ) : cancelConfirming ? (
            <>
              <p className="text-caption text-fg-muted mr-auto">{t("cancelTaskConfirm")}</p>
              <Button
                variant="secondary"
                loading={pending}
                onClick={() => run(() => cancelTask(task.id))}
              >
                {t("cancelTaskConfirmButton")}
              </Button>
              <Button variant="ghost" onClick={() => setCancelConfirming(false)}>
                {t("closeTask")}
              </Button>
            </>
          ) : (
            <>
              {canCancel ? (
                <Button variant="ghost" onClick={() => setCancelConfirming(true)}>
                  {t("cancelTask")}
                </Button>
              ) : null}

              {!isDone && !isCancelled ? (
                <Button
                  variant="primary"
                  loading={pending}
                  onClick={() => run(() => completeTask(task.id))}
                >
                  {t("complete")}
                </Button>
              ) : null}

              {!isDone && !isCancelled && task.status !== "in_progress" && !isBlocked ? (
                <Button loading={pending} onClick={() => run(() => startTask(task.id))}>
                  {t("start")}
                </Button>
              ) : null}

              {isBlocked ? (
                <Button loading={pending} onClick={() => run(() => clearBlocker(task.id))}>
                  {t("clearBlocker")}
                </Button>
              ) : !isDone && !isCancelled ? (
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
