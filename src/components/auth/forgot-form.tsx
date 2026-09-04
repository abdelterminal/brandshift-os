"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestReset } from "@/lib/actions/reset";

/**
 * Asking for a reset link.
 *
 * The confirmation is the same sentence whatever happened: sent, not sent
 * because the address is a stranger, not sent because they asked five minutes
 * ago. The form cannot tell you which, and that is the point -- a reset form
 * that says "no such account" hands back everything sign-in refuses to give.
 *
 * It replaces itself with the confirmation rather than showing one above a
 * still-live form, so nobody presses it four more times wondering whether it
 * worked.
 */
export function ForgotForm() {
  const t = useTranslations("Forgot");

  const [asked, setAsked] = useState(false);
  const [pending, startTransition] = useTransition();

  if (asked) {
    return (
      <p role="status" className="text-body text-fg-default">
        {t("sent")}
      </p>
    );
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      await requestReset({ email: String(formData.get("email") ?? "") });
      setAsked(true);
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          maxLength={320}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
