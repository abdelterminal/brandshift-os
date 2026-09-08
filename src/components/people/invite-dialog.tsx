"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { departmentLabel } from "@/components/ui/department-label";
import { TextField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
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
import { invitePerson } from "@/lib/actions/people";
import type { DepartmentRow } from "@/lib/data/people";
import { cn } from "@/lib/utils";

/**
 * Invite someone.
 *
 * A dialog rather than a page, because it is one short decision and the
 * directory behind it is the context. It does not open anything else -- a
 * dialog from a dialog is the pattern this app does not use.
 *
 * The copy says plainly that no email goes out yet. Pretending otherwise would
 * leave someone waiting for a message that never arrives.
 */
export function InviteDialog({ departments }: { departments: DepartmentRow[] }) {
  const t = useTranslations("People");
  const roles = useTranslations("Roles");
  const common = useTranslations("Common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectClass = cn(
    "h-9 w-full rounded-control border px-2.5 text-body",
    "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
    focusRing,
    transition,
  );

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await invitePerson(formData);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="primary" />}>
        <UserPlus aria-hidden className="size-4" />
        {t("invite")}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{t("inviteBody")}</DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4" noValidate>
          <TextField
            name="name"
            label={t("name")}
            autoComplete="name"
            error={fieldErrors.name ? t("invalid") : undefined}
          />
          <TextField
            name="email"
            type="email"
            label={t("email")}
            autoComplete="email"
            error={
              fieldErrors.email
                ? t(fieldErrors.email === "alreadyMember" ? "alreadyMember" : "invalid")
                : undefined
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-role" className="text-label text-fg-default w-fit">
                {t("role")}
              </label>
              <select id="invite-role" name="role" defaultValue="member" className={selectClass}>
                {(["member", "manager", "admin", "owner"] as const).map((role) => (
                  <option key={role} value={role}>
                    {roles(role)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-department" className="text-label text-fg-default w-fit">
                {t("department")}
              </label>
              <select id="invite-department" name="departmentId" className={selectClass}>
                <option value="">--</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {departmentLabel(department, departments)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <TextField
            name="jobTitle"
            label={t("jobTitle")}
            required={false}
            error={fieldErrors.jobTitle ? t("invalid") : undefined}
          />

          <div aria-live="polite" className="empty:hidden">
            {error && error !== "invalid" ? (
              <p className="text-body text-blocked-text bg-blocked-bg border-blocked-border rounded-control border px-3 py-2">
                {t(
                  error as
                    | "alreadyMember"
                    | "onlyOwnerCanInviteOwner"
                    | "notFound",
                )}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>{common("cancel")}</DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
