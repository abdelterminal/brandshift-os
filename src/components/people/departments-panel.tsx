"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { departmentLabel } from "@/components/ui/department-label";
import { TextField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { focusRing, transition } from "@/components/ui/styles";
import { createDepartment, updateDepartment } from "@/lib/actions/people";
import type { DepartmentRow } from "@/lib/data/people";
import { cn } from "@/lib/utils";

const textareaClass = cn(
  "min-h-20 w-full rounded-control border px-2.5 py-2 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

/** Whether `name` collides with an existing department, other than `exceptId` itself. */
function collidesWithExisting(
  departments: DepartmentRow[],
  name: string,
  exceptId?: string,
): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return departments.some(
    (d) => d.id !== exceptId && d.name.trim().toLocaleLowerCase() === normalized,
  );
}

/**
 * The org's departments: what exists, and the one way to add another.
 *
 * Behind `organization.editSettings`, in Settings rather than on the People
 * page -- this is the org's own shape, the same question as its name or its
 * timezone, not something that belongs beside inviting one person at a time.
 * A fresh organization starts with none: `/signup` only asks for a name, so
 * this is the first place anyone lands to build the rest of the structure
 * People, projects and templates all point at.
 */
export function DepartmentsPanel({ departments }: { departments: DepartmentRow[] }) {
  const t = useTranslations("Departments");
  const ui = useTranslations("Ui");
  const [name, setName] = useState("");
  const common = useTranslations("Common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const descriptionId = useId();

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createDepartment(formData);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="secondary" size="sm" />}>
            <Plus aria-hidden className="size-4" />
            {t("new")}
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("newTitle")}</DialogTitle>
              <DialogDescription>{t("newBody")}</DialogDescription>
            </DialogHeader>

            <form action={submit} className="flex flex-col gap-4" noValidate>
              <TextField
                name="name"
                label={t("name")}
                autoFocus
                value={name}
                onValueChange={setName}
                hint={ui("required")}
                error={fieldErrors.name ? t("invalid") : undefined}
              />

              {collidesWithExisting(departments, name) ? (
                <p className="text-caption text-fg-muted" role="status">
                  {ui("duplicateDepartment")}
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-1">
                  <label htmlFor={descriptionId} className="text-label text-fg-default w-fit">
                    {t("description")}
                  </label>
                  <span aria-hidden="true" className="text-caption text-fg-muted">
                    · {ui("optional")}
                  </span>
                </div>
                <textarea id={descriptionId} name="description" className={textareaClass} />
              </div>

              <div aria-live="polite" className="empty:hidden">
                {error && error !== "invalid" ? (
                  <p className="text-body text-blocked-text bg-blocked-bg border-blocked-border rounded-control border px-3 py-2">
                    {error}
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <DialogClose render={<Button variant="secondary" />}>
                  {common("cancel")}
                </DialogClose>
                <Button type="submit" variant="primary" loading={pending}>
                  {t("create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {departments.length === 0 ? (
          <p className="text-body text-fg-muted">{t("emptyBody")}</p>
        ) : (
          <ul className="border-border divide-border rounded-card divide-y border">
            {departments.map((department) => (
              <li key={department.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-body text-fg-default font-medium">
                    {departmentLabel(department, departments)}
                  </p>
                  {department.description ? (
                    <p className="text-caption text-fg-muted mt-0.5">{department.description}</p>
                  ) : null}
                </div>
                <EditDepartmentDialog department={department} departments={departments} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Rename a department, or change its description -- the one dialog per row,
 * pre-filled, closing the gap `KNOWN-GAPS.md` used to name: creating one was
 * the only write this screen could make.
 */
function EditDepartmentDialog({
  department,
  departments,
}: {
  department: DepartmentRow;
  departments: DepartmentRow[];
}) {
  const t = useTranslations("Departments");
  const ui = useTranslations("Ui");
  const common = useTranslations("Common");
  const router = useRouter();
  const descriptionId = useId();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(department.name);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await updateDepartment(formData);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reopening always starts from what's actually saved, not whatever
        // was left half-typed the last time this row's dialog was closed.
        if (next) setName(department.name);
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("edit")} />}>
        <Pencil aria-hidden className="size-4" />
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("editBody")}</DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="id" value={department.id} />

          <TextField
            name="name"
            label={t("name")}
            autoFocus
            value={name}
            onValueChange={setName}
            hint={ui("required")}
            error={fieldErrors.name ? t("invalid") : undefined}
          />

          {collidesWithExisting(departments, name, department.id) ? (
            <p className="text-caption text-fg-muted" role="status">
              {ui("duplicateDepartment")}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-1">
              <label htmlFor={descriptionId} className="text-label text-fg-default w-fit">
                {t("description")}
              </label>
              <span aria-hidden="true" className="text-caption text-fg-muted">
                · {ui("optional")}
              </span>
            </div>
            <textarea
              id={descriptionId}
              name="description"
              defaultValue={department.description ?? ""}
              className={textareaClass}
            />
          </div>

          <div aria-live="polite" className="empty:hidden">
            {error === "notFound" ? (
              <p className="text-body text-blocked-text bg-blocked-bg border-blocked-border rounded-control border px-3 py-2">
                {t("notFound")}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>{common("cancel")}</DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {common("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
