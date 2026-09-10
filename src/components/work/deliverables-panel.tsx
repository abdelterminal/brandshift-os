"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import {
  convertTaskToDeliverableAction,
  createDeliverableAction,
  setDeliverableStatusAction,
  updateDeliverableAction,
} from "@/lib/actions/deliverables";
import type { AssignablePerson } from "@/lib/data/task-types";
import { PROJECT_STAGES, type ProjectStage } from "@/lib/data/pipeline-stages";
import {
  DELIVERABLE_STATUSES,
  nextStatus,
  prevStatus,
  type DeliverableStatus,
} from "@/lib/deliverables";
import { cn } from "@/lib/utils";

export type DeliverableRow = {
  id: string;
  title: string;
  description: string | null;
  status: DeliverableStatus;
  stage: ProjectStage | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  clientFeedback: string | null;
  dueDate: string | null;
};

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

const STATUS_TONE: Record<DeliverableStatus, "neutral" | "active" | "attention" | "complete"> = {
  producing: "neutral",
  internal_review: "active",
  with_client: "active",
  revising: "attention",
  published: "complete",
  cancelled: "neutral",
};

/**
 * A project's deliverables, grouped by where they are on the line.
 *
 * Forward/back chevrons per row rather than a drag board -- there are five
 * states and the move is a single fact, the same call the pipeline board
 * makes for a project's stage. Moving *into* Revising asks for the client's
 * feedback first, the shape the task board uses for a blocker reason.
 */
export function DeliverablesPanel({
  projectId,
  deliverables,
  assignablePeople,
  convertibleTasks,
  canWork,
  canConvert,
}: {
  projectId: string;
  deliverables: DeliverableRow[];
  assignablePeople: AssignablePerson[];
  /** The project's open tasks, for the "convert a task" dialog. */
  convertibleTasks: { id: string; title: string }[];
  canWork: boolean;
  canConvert: boolean;
}) {
  const t = useTranslations("Deliverable");
  const work = useTranslations("Work");
  const statusLabels = useTranslations("DeliverableStatus");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [dialog, setDialog] = useState<{ mode: "new" } | { mode: "edit"; row: DeliverableRow } | null>(
    null,
  );
  const [converting, setConverting] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<{ id: string; to: DeliverableStatus } | null>(null);

  function move(id: string, to: DeliverableStatus, feedback?: string) {
    startTransition(async () => {
      const result = await setDeliverableStatusAction({ id, status: to, feedback });
      if (!result.ok) {
        if (result.error === "feedbackRequired") {
          setFeedbackFor({ id, to });
          return;
        }
        if (result.error !== "alreadyThere") {
          toast.add({ title: t("errorInvalid"), data: { tone: "attention" } });
        }
        return;
      }
      setFeedbackFor(null);
      router.refresh();
    });
  }

  function step(row: DeliverableRow, direction: "next" | "prev") {
    const to = direction === "next" ? nextStatus(row.status) : prevStatus(row.status);
    if (!to) return;
    if (to === "revising") {
      setFeedbackFor({ id: row.id, to });
      return;
    }
    move(row.id, to);
  }

  const groups = DELIVERABLE_STATUSES.map((status) => ({
    status,
    rows: deliverables.filter((row) => row.status === status),
  })).filter((group) => group.rows.length > 0 || group.status !== "cancelled");

  return (
    <div>
      {canWork ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {canConvert && convertibleTasks.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => setConverting(true)}>
              {work("convertToDeliverable")}
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={() => setDialog({ mode: "new" })}>
            <Plus aria-hidden className="size-4" />
            {t("newDeliverable")}
          </Button>
        </div>
      ) : null}

      {deliverables.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("empty")} description={t("emptyBody")} />
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.status}>
              <h3 className="text-label text-fg-muted mb-2 flex items-center gap-2">
                {statusLabels(group.status)}
                <span className="text-fg-subtle tabular-nums">{group.rows.length}</span>
              </h3>
              {group.rows.length === 0 ? (
                <p className="text-caption text-fg-subtle">--</p>
              ) : (
                <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
                  {group.rows.map((row) => (
                    <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setDialog({ mode: "edit", row })}
                          className={cn(
                            "text-body text-fg-default text-left hover:underline",
                            focusRing,
                          )}
                        >
                          {row.title}
                        </button>
                        <div className="text-caption text-fg-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {row.assigneeName ? (
                            <span className="inline-flex items-center gap-1">
                              <PersonAvatar name={row.assigneeName} size="xs" />
                              {row.assigneeName}
                            </span>
                          ) : (
                            <span>{t("unassigned")}</span>
                          )}
                          {row.dueDate ? (
                            <span>
                              {t("dueDate")}: {row.dueDate}
                            </span>
                          ) : null}
                          {row.stage ? (
                            <Badge tone="neutral" size="sm">
                              {row.stage}
                            </Badge>
                          ) : null}
                        </div>
                        {row.status === "revising" && row.clientFeedback ? (
                          <p className="text-caption text-fg-muted mt-1">
                            {t("clientFeedback")}: {row.clientFeedback}
                          </p>
                        ) : null}
                      </div>

                      {canWork ? (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            aria-label={t("sendBack")}
                            disabled={pending || !prevStatus(row.status)}
                            onClick={() => step(row, "prev")}
                            className={cn(
                              "text-fg-muted hover:text-fg-default rounded-control p-1 disabled:opacity-30",
                              focusRing,
                              transition,
                            )}
                          >
                            <ChevronLeft className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={t("advance")}
                            disabled={pending || !nextStatus(row.status)}
                            onClick={() => step(row, "next")}
                            className={cn(
                              "text-fg-muted hover:text-fg-default rounded-control p-1 disabled:opacity-30",
                              focusRing,
                              transition,
                            )}
                          >
                            <ChevronRight className="size-4" aria-hidden />
                          </button>
                        </div>
                      ) : (
                        <Badge tone={STATUS_TONE[row.status]} size="sm">
                          {statusLabels(row.status)}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {dialog ? (
        <DeliverableDialog
          projectId={projectId}
          assignablePeople={assignablePeople}
          initial={dialog.mode === "edit" ? dialog.row : null}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}

      {feedbackFor ? (
        <FeedbackDialog
          onCancel={() => setFeedbackFor(null)}
          onConfirm={(feedback) => move(feedbackFor.id, feedbackFor.to, feedback)}
          pending={pending}
        />
      ) : null}

      {converting ? (
        <ConvertDialog
          tasks={convertibleTasks}
          onClose={() => setConverting(false)}
          onDone={() => {
            setConverting(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ConvertDialog({
  tasks,
  onClose,
  onDone,
}: {
  tasks: { id: string; title: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("Deliverable");
  const work = useTranslations("Work");
  const stageLabels = useTranslations("ProjectStage");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await convertTaskToDeliverableAction({
        taskId: String(formData.get("taskId") ?? ""),
        stage: String(formData.get("stage") ?? "") as ProjectStage | "",
      });
      if (!result.ok) {
        setError(result.error === "notFound" ? t("errorNotFound") : t("errorInvalid"));
        return;
      }
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{work("convertToDeliverable")}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <p className="text-caption text-fg-muted">{work("convertHint")}</p>
          <Field>
            <FieldLabel htmlFor="taskId">{work("tasks")}</FieldLabel>
            <select id="taskId" name="taskId" className={selectClass} required>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="convert-stage">{t("stage")}</FieldLabel>
            <select id="convert-stage" name="stage" className={selectClass} defaultValue="">
              <option value="">{t("noStage")}</option>
              {PROJECT_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels(stage)}
                </option>
              ))}
            </select>
          </Field>
          {error ? (
            <p role="alert" className="text-body text-status-blocked-text">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="secondary">
                  {t("cancel")}
                </Button>
              }
            />
            <Button type="submit" loading={pending}>
              {work("convertToDeliverable")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeliverableDialog({
  projectId,
  assignablePeople,
  initial,
  onClose,
  onSaved,
}: {
  projectId: string;
  assignablePeople: AssignablePerson[];
  initial: DeliverableRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Deliverable");
  const stageLabels = useTranslations("ProjectStage");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const payload = {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      stage: String(formData.get("stage") ?? "") as ProjectStage | "",
      assigneeUserId: String(formData.get("assigneeUserId") ?? ""),
      dueDate: String(formData.get("dueDate") ?? ""),
    };
    startTransition(async () => {
      const result = initial
        ? await updateDeliverableAction({ id: initial.id, ...payload })
        : await createDeliverableAction({ projectId, ...payload });
      if (!result.ok) {
        setError(result.error === "notFound" ? t("errorNotFound") : t("errorInvalid"));
        return;
      }
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("edit") : t("newDeliverable")}</DialogTitle>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="title">{t("title")}</FieldLabel>
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              defaultValue={initial?.title ?? ""}
              placeholder={t("titlePlaceholder")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
            <Textarea
              id="description"
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={initial?.description ?? ""}
              placeholder={t("descriptionPlaceholder")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="assigneeUserId">{t("assignee")}</FieldLabel>
              <select
                id="assigneeUserId"
                name="assigneeUserId"
                className={selectClass}
                defaultValue={initial?.assigneeUserId ?? ""}
              >
                <option value="">{t("unassigned")}</option>
                {assignablePeople.map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dueDate">{t("dueDate")}</FieldLabel>
              <Input id="dueDate" name="dueDate" type="date" defaultValue={initial?.dueDate ?? ""} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="stage">{t("stage")}</FieldLabel>
            <select
              id="stage"
              name="stage"
              className={selectClass}
              defaultValue={initial?.stage ?? ""}
            >
              <option value="">{t("noStage")}</option>
              {PROJECT_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels(stage)}
                </option>
              ))}
            </select>
          </Field>

          {error ? (
            <p role="alert" className="text-body text-status-blocked-text">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="secondary">
                  {t("cancel")}
                </Button>
              }
            />
            <Button type="submit" loading={pending}>
              {initial ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackDialog({
  onCancel,
  onConfirm,
  pending,
}: {
  onCancel: () => void;
  onConfirm: (feedback: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("Deliverable");
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("feedbackPrompt")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            aria-label={t("feedbackPrompt")}
            rows={3}
            maxLength={4000}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          {touched && value.trim().length === 0 ? (
            <p role="alert" className="text-body text-status-blocked-text">
              {t("feedbackRequired")}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            loading={pending}
            onClick={() => {
              setTouched(true);
              if (value.trim().length > 0) onConfirm(value.trim());
            }}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
