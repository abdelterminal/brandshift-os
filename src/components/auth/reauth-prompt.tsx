"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { confirmPassword, type FormState } from "@/lib/auth/actions";

/**
 * The re-auth window has lapsed; prove the password once and carry on.
 *
 * Shared rather than copied, because every caller has to behave identically:
 * this is the prompt standing between somebody and a sensitive act, and two
 * versions of it would eventually disagree about what counts as confirmed.
 *
 * Shown only after an action has already refused with `reauthRequired` -- never
 * up front. Asking before the attempt is how the old app trained people to type
 * their password without reading what they were agreeing to.
 */
export function ReauthPrompt({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = await confirmPassword(previous, formData);
      if (result.ok) onDone();
      return result;
    },
    {},
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface-inset rounded-control mt-4 flex flex-col gap-3 border p-3"
    >
      <p className="text-label text-fg-default">{t("confirmToContinue")}</p>
      <PasswordField
        name="password"
        label={t("password")}
        autoComplete="current-password"
        error={state.error ? t(state.error) : undefined}
      />
      <Button type="submit" size="sm" variant="primary" loading={pending} className="w-fit">
        {t("confirm")}
      </Button>
    </form>
  );
}
