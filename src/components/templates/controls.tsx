"use client";

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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import {
  addTemplate,
  captureFromProject,
  captureFromSop,
  retireTemplate,
  updateTemplateTasks,
  startFromTemplate,
} from "@/lib/actions/templates";
import { cn } from "@/lib/utils";

/**
 * Writing a template, and starting a project from one.
 *
 * The offset field is the one worth being careful with: blank means "no
 * deadline", which is a real answer rather than a mistake, so it has its own
 * hint rather than being validated as if it were required.
 */

export type Option = { id: string; label: string };

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

function useErrorText() {
  const t = useTranslations("Templates");
  return (code: string) => {
    const known: Record<string, string> = {
      offset: t("errorOffset"),
      noTasks: t("errorNoTasks"),
      notFound: t("errorNotFound"),
      keyFormat: t("errorKeyFormat"),
      keyTaken: t("errorKeyTaken"),
      alreadyThere: t("errorAlreadyThere"),
    };
    return known[code] ?? t("errorInvalid");
  };
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-body text-status-blocked-text">
      {children}
    </p>
  );
}

type DraftTask = {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  offsetDays: string;
};

const emptyTask = (): DraftTask => ({
  title: "",
  description: "",
  priority: "medium",
  offsetDays: "",
});

function TaskFields({
  tasks,
  setTasks,
}: {
  tasks: DraftTask[];
  setTasks: React.Dispatch<React.SetStateAction<DraftTask[]>>;
}) {
  const t = useTranslations("Templates");

  const update = (index: number, patch: Partial<DraftTask>) =>
    setTasks((current) => current.map((task, i) => (i === index ? { ...task, ...patch } : task)));

  return (
    <fieldset className="border-border space-y-3 rounded-card border p-4">
      <legend className="text-label text-fg-default px-1 font-semibold">{t("tasks")}</legend>

      {tasks.map((task, index) => (
        <div key={index} className="space-y-2">
          <Input
            aria-label={`${t("taskTitle")} ${index + 1}`}
            value={task.title}
            onChange={(event) => update(index, { title: event.target.value })}
            placeholder={t("taskTitlePlaceholder")}
            maxLength={200}
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label={`${t("priority")} ${index + 1}`}
              className={selectClass}
              value={task.priority}
              onChange={(event) =>
                update(index, { priority: event.target.value as DraftTask["priority"] })
              }
            >
              <option value="low">{t("priorityLow")}</option>
              <option value="medium">{t("priorityMedium")}</option>
              <option value="high">{t("priorityHigh")}</option>
              <option value="urgent">{t("priorityUrgent")}</option>
            </select>

            <Input
              aria-label={`${t("offset")} ${index + 1}`}
              inputMode="numeric"
              placeholder={t("offset")}
              value={task.offsetDays}
              onChange={(event) => update(index, { offsetDays: event.target.value })}
            />
          </div>

          {tasks.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTasks((current) => current.filter((_, i) => i !== index))}
            >
              {t("removeTask", { number: index + 1 })}
            </Button>
          ) : null}
        </div>
      ))}

      <p className="text-caption text-fg-muted">{t("offsetHelp")}</p>

      {tasks.length < 60 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setTasks((current) => [...current, emptyTask()])}
        >
          {t("addTask")}
        </Button>
      ) : null}
    </fieldset>
  );
}

export function NewTemplateDialog({ departments }: { departments: Option[] }) {
  const t = useTranslations("Templates");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tasks, setTasks] = useState<DraftTask[]>([emptyTask()]);

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await addTemplate({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        departmentId: String(formData.get("departmentId") ?? ""),
        tasks,
      });

      if (result && !result.ok) setError(errorText(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("newTemplate")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("newTemplate")}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto">
            <Field>
              <FieldLabel htmlFor="name">{t("templateName")}</FieldLabel>
              <Input
                id="name"
                name="name"
                required
                maxLength={200}
                placeholder={t("templateNamePlaceholder")}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
              <Input id="description" name="description" maxLength={4000} />
            </Field>

            <Field>
              <FieldLabel htmlFor="departmentId">{t("department")}</FieldLabel>
              <select id="departmentId" name="departmentId" className={selectClass}>
                <option value="">{t("wholeCompany")}</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.label}
                  </option>
                ))}
              </select>
            </Field>

            <TaskFields tasks={tasks} setTasks={setTasks} />

            {error ? <ErrorNote>{error}</ErrorNote> : null}

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
    </>
  );
}

export function EditTasksDialog({
  templateId,
  initialTasks,
}: {
  templateId: string;
  initialTasks: Array<{
    title: string;
    description: string | null;
    priority: DraftTask["priority"];
    offsetDays: number | null;
  }>;
}) {
  const t = useTranslations("Templates");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tasks, setTasks] = useState<DraftTask[]>(
    initialTasks.length > 0
      ? initialTasks.map((task) => ({
          title: task.title,
          description: task.description ?? "",
          priority: task.priority,
          offsetDays: task.offsetDays === null ? "" : String(task.offsetDays),
        }))
      : [emptyTask()],
  );

  function onSubmit() {
    setError(null);

    startTransition(async () => {
      const result = await updateTemplateTasks({ templateId, tasks });
      if (!result.ok) setError(errorText(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("editTasks")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("editTasks")}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto">
            <TaskFields tasks={tasks} setTasks={setTasks} />
            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button type="submit" loading={pending}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The point of the whole feature: a template becomes a real project. */
export function StartProjectDialog({
  templateId,
  templateName,
  today,
}: {
  templateId: string;
  templateName: string;
  today: string;
}) {
  const t = useTranslations("Templates");
  const errorText = useErrorText();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await startFromTemplate({
        templateId,
        key: String(formData.get("key") ?? ""),
        name: String(formData.get("name") ?? ""),
        startDate: String(formData.get("startDate") ?? ""),
      });

      // Success redirects to the new project, so anything here is a refusal.
      if (result && !result.ok) setError(errorText(result.error));
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("start")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("startFrom", { name: templateName })}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="name">{t("projectName")}</FieldLabel>
              <Input id="name" name="name" required maxLength={200} defaultValue={templateName} />
            </Field>

            <Field>
              <FieldLabel htmlFor="key">{t("projectKey")}</FieldLabel>
              <Input id="key" name="key" required maxLength={5} />
              <FieldDescription>{t("projectKeyHelp")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="startDate">{t("startDate")}</FieldLabel>
              <Input id="startDate" name="startDate" type="date" required defaultValue={today} />
              <FieldDescription>{t("startsWhen")}</FieldDescription>
            </Field>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button type="submit" loading={pending}>
                {t("start")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Capture a template from something that already exists.
 *
 * One component for both sources, because the interaction is identical: give
 * it a name, and the steps or tasks come across. The `from` prop picks which
 * action runs.
 */
export function CaptureTemplateButton({
  from,
  sourceId,
  suggestedName,
  label,
}: {
  from: "sop" | "project";
  sourceId: string;
  suggestedName: string;
  label: string;
}) {
  const t = useTranslations("Templates");
  const errorText = useErrorText();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const input = { sourceId, name: String(formData.get("name") ?? "") };
      const result = from === "sop" ? await captureFromSop(input) : await captureFromProject(input);
      if (result && !result.ok) setError(errorText(result.error));
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor={`capture-${sourceId}`}>{t("captureName")}</FieldLabel>
              <Input
                id={`capture-${sourceId}`}
                name="name"
                required
                maxLength={200}
                defaultValue={suggestedName}
              />
            </Field>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

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
    </>
  );
}

export function RetireTemplateButton({ templateId }: { templateId: string }) {
  const t = useTranslations("Templates");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await retireTemplate(templateId);
          router.refresh();
        })
      }
    >
      {t("retire")}
    </Button>
  );
}
