"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

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
import { createDepartment } from "@/lib/actions/people";
import type { DepartmentRow } from "@/lib/data/people";
import { cn } from "@/lib/utils";

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
  const common = useTranslations("Common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const descriptionId = useId();

  const textareaClass = cn(
    "min-h-20 w-full rounded-control border px-2.5 py-2 text-body",
    "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
    focusRing,
    transition,
  );

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
                error={fieldErrors.name ? t("invalid") : undefined}
              />

              <div className="flex flex-col gap-1.5">
                <label htmlFor={descriptionId} className="text-label text-fg-default w-fit">
                  {t("description")}
                </label>
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
              <li key={department.id} className="px-4 py-3">
                <p className="text-body text-fg-default font-medium">{department.name}</p>
                {department.description ? (
                  <p className="text-caption text-fg-muted mt-0.5">{department.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
