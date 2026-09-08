"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { updateProfile } from "@/lib/actions/profile";
import { cn } from "@/lib/utils";

/**
 * The three things about yourself you may change.
 *
 * Everything else on this page is read-only and says so, rather than being
 * absent: somebody looking for their role or their leave allowance should find
 * it here and see that it is not theirs to set, not wonder where it went.
 */

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

export function ProfileForm({
  name,
  jobTitle,
  locale,
}: {
  name: string;
  jobTitle: string | null;
  /** `null` means no personal override -- follow the organization. */
  locale: "en" | "fr" | null;
}) {
  const t = useTranslations("Profile");
  const router = useRouter();
  const toast = useToast();

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await updateProfile({
        name: String(formData.get("name") ?? ""),
        jobTitle: String(formData.get("jobTitle") ?? ""),
        locale: String(formData.get("locale") ?? "") as "en" | "fr" | "",
      });

      if (!result.ok) setError(t("errorInvalid"));
      else {
        toast.add({ title: t("saved") });
        router.refresh();
      }
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <Field>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input name="name" required maxLength={120} defaultValue={name} />
      </Field>

      <Field>
        <FieldLabel>{t("jobTitle")}</FieldLabel>
        <Input
          name="jobTitle"
          maxLength={120}
          defaultValue={jobTitle ?? ""}
          placeholder={t("jobTitlePlaceholder")}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="locale">{t("language")}</FieldLabel>
        <select id="locale" name="locale" className={selectClass} defaultValue={locale ?? ""}>
          <option value="">{t("followOrganization")}</option>
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
        <FieldDescription>{t("languageHelp")}</FieldDescription>
      </Field>

      {error ? (
        <p role="alert" className="text-body text-status-blocked-text">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
