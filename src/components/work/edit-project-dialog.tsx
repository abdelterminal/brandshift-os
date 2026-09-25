"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { updateProjectDetails } from "@/lib/actions/projects";
import { cn } from "@/lib/utils";

/**
 * Correcting a project's details.
 *
 * The fields the creation wizard collected and nothing could change afterwards.
 * Labels come from the wizard's own `NewProject` namespace rather than a second
 * set of their own, so the two forms cannot drift into calling the same field
 * different things.
 *
 * Status, stage and client are absent on purpose -- each already has a control
 * on this page, and the project key is the URL, so it does not move.
 */

type Option = { id: string; label: string };

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

export function EditProjectDialog({
  project,
  departments,
  people,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    departmentId: string | null;
    ownerUserId: string | null;
    startDate: string | null;
    dueDate: string | null;
    priority: (typeof PRIORITIES)[number];
  };
  departments: Option[];
  people: Option[];
}) {
  const t = useTranslations("Work");
  const fields = useTranslations("NewProject");
  const priorities = useTranslations("Priority");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [departmentId, setDepartmentId] = useState(project.departmentId ?? "");
  const [ownerUserId, setOwnerUserId] = useState(project.ownerUserId ?? "");
  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [dueDate, setDueDate] = useState(project.dueDate ?? "");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(project.priority);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Reopening shows what is stored, not whatever a cancelled edit left behind. */
  function onOpenChange(next: boolean) {
    if (next) {
      setName(project.name);
      setDescription(project.description ?? "");
      setDepartmentId(project.departmentId ?? "");
      setOwnerUserId(project.ownerUserId ?? "");
      setStartDate(project.startDate ?? "");
      setDueDate(project.dueDate ?? "");
      setPriority(project.priority);
      setError(null);
    }
    setOpen(next);
  }

  return (
    <>
      <Button onClick={() => onOpenChange(true)}>{t("editProject")}</Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editProject")}</DialogTitle>
            <DialogDescription>{t("editProjectSubtitle")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await updateProjectDetails({
                  projectId: project.id,
                  name,
                  description: description || undefined,
                  departmentId: departmentId || undefined,
                  ownerUserId: ownerUserId || undefined,
                  startDate: startDate || undefined,
                  dueDate: dueDate || undefined,
                  priority,
                });
                if (!result.ok) {
                  setError(fields("invalid"));
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <Field>
              <FieldLabel>{fields("name")}</FieldLabel>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={fields("namePlaceholder")}
                required
              />
            </Field>

            <Field>
              <FieldLabel>{fields("description")}</FieldLabel>
              <Textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={fields("descriptionPlaceholder")}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-project-department">{fields("department")}</FieldLabel>
                <select
                  id="edit-project-department"
                  className={selectClass}
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">{fields("noDepartment")}</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-project-owner">{fields("owner")}</FieldLabel>
                <select
                  id="edit-project-owner"
                  className={selectClass}
                  value={ownerUserId}
                  onChange={(event) => setOwnerUserId(event.target.value)}
                >
                  <option value="">—</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>{t("startDate")}</FieldLabel>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel>{fields("dueDate")}</FieldLabel>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-project-priority">{fields("priority")}</FieldLabel>
                <select
                  id="edit-project-priority"
                  className={selectClass}
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as (typeof PRIORITIES)[number])
                  }
                >
                  {PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {priorities(value)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {error ? (
              <p role="alert" className="text-body text-blocked-text">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose render={<Button type="button">{t("setStatusConfirmCancel")}</Button>} />
              <Button
                type="submit"
                variant="primary"
                loading={pending}
                disabled={name.trim().length < 2}
              >
                {t("saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
