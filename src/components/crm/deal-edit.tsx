"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { editDeal } from "@/lib/actions/crm";

/**
 * Correcting a deal after it was created.
 *
 * Title, value and close date were set once from the dialog and then could not
 * be touched, which meant a typo in a figure survived until somebody deleted
 * the deal and made another. `editDeal` had existed since CRM shipped with
 * nothing calling it -- this is the caller.
 *
 * Inline, in the same shape as `CompanyNotes`: an edit button that swaps the
 * read view for a form, rather than a dialog. These are three fields somebody
 * is correcting while looking at them, and a dialog would hide the thing being
 * corrected behind the thing correcting it.
 *
 * Stage is not here. It moves through `StageControl`, because losing a deal
 * has to ask why, and a plain form field cannot.
 */
export function DealEdit({
  dealId,
  title,
  value,
  expectedCloseDate,
}: {
  dealId: string;
  title: string;
  /** The decimal string the form shows, or empty for a deal with no figure. */
  value: string;
  expectedCloseDate: string | null;
}) {
  const t = useTranslations("Crm");
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <Button size="sm" onClick={() => setEditing(true)}>
        {t("editDeal")}
      </Button>
    );
  }

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await editDeal({
        dealId,
        title: String(formData.get("title") ?? ""),
        value: String(formData.get("value") ?? ""),
        expectedCloseDate: String(formData.get("expectedCloseDate") ?? ""),
      });

      if (!result.ok) {
        setError(result.error === "money" ? t("money") : t("invalid"));
        return;
      }

      setError(null);
      setEditing(false);
      toast.add({ title: t("saved") });
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="flex w-full flex-col gap-3">
      <Field>
        <FieldLabel htmlFor={`title-${dealId}`}>{t("dealTitle")}</FieldLabel>
        <Input id={`title-${dealId}`} name="title" required maxLength={200} defaultValue={title} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`value-${dealId}`}>{t("value")}</FieldLabel>
          <Input
            id={`value-${dealId}`}
            name="value"
            inputMode="decimal"
            defaultValue={value}
            placeholder={t("valuePlaceholder")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`close-${dealId}`}>{t("closeDate")}</FieldLabel>
          <Input
            id={`close-${dealId}`}
            name="expectedCloseDate"
            type="date"
            defaultValue={expectedCloseDate ?? ""}
          />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="text-body text-status-blocked-text">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" loading={pending}>
          {t("save")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
