"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { createTask } from "@/lib/actions/tasks";
import type { AssignablePerson } from "@/lib/data/task-types";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

/**
 * Break a project down, one task at a time.
 *
 * The button anyone connected to a project's work sees -- the same population
 * `mayWorkOn()` lets start, complete or block a task, because adding one is
 * the same kind of ordinary write. For a project task the assignee defaults to
 * whoever opened the dialog; for a personal one (`projectId === null`, from
 * Today) there is no assignee field at all -- a to-do with no project is
 * always your own, and the action enforces that server-side too.
 */
export function NewTaskDialog({
  projectId,
  assignablePeople,
  currentUserId,
}: {
  projectId: string | null;
  /** Only asked for on a project task. */
  assignablePeople: AssignablePerson[];
  currentUserId: string;
}) {
  const t = useTranslations("Task");
  const priorities = useTranslations("Priority");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    if (projectId) formData.set("projectId", projectId);

    startTransition(async () => {
      const result = await createTask(formData);
      if (!result.ok) {
        setError(result.error ?? "titleRequired");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        {t("newTask")}
      </Button>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("newTask")}</DialogTitle>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="task-title">{t("title")}</FieldLabel>
            <Input id="task-title" name="title" required maxLength={200} autoFocus />
            {error === "titleRequired" ? <FieldError match>{t("titleRequired")}</FieldError> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="task-description">{t("description")}</FieldLabel>
            <Textarea
              id="task-description"
              name="description"
              rows={3}
              maxLength={4000}
              placeholder={t("descriptionPlaceholder")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            {projectId ? (
              <Field>
                <FieldLabel htmlFor="task-assignee">{t("assignee")}</FieldLabel>
                <select
                  id="task-assignee"
                  name="assigneeUserId"
                  className={selectClass}
                  defaultValue={currentUserId}
                >
                  <option value="">{t("unassigned")}</option>
                  {assignablePeople.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="task-due">{t("dueDate")}</FieldLabel>
              <Input id="task-due" name="dueDate" type="date" />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="task-priority">{t("priority")}</FieldLabel>
            <select id="task-priority" name="priority" className={selectClass} defaultValue="medium">
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priorities(priority)}
                </option>
              ))}
            </select>
          </Field>

          {error && error !== "titleRequired" ? (
            <p role="alert" className="text-body text-status-blocked-text">
              {t(error === "forbidden" ? "workRestricted" : "genericError")}
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
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
