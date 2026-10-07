"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { changePassword, type FormState } from "@/lib/auth/actions";

import { PasswordField } from "./password-field";

/**
 * Change password.
 *
 * The current password is required, which doubles as the re-authentication --
 * there is no second prompt on top of it. Succeeding signs out every other
 * device, and says so before you press the button rather than afterwards.
 *
 * The fields are separated from the card because this form has two homes now:
 * Settings, where it is one panel among several, and `/new-password`, where it
 * is the only thing on the screen and somebody is being *made* to use it. Same
 * action, same validation, same field errors -- only the frame differs, which
 * is the point of splitting it rather than writing a second one that would
 * drift.
 */
function ChangePasswordFields({ submitLabel }: { submitLabel?: string }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(changePassword, {});

  const fieldError = (field: string) =>
    state.fieldErrors?.[field] ? t(state.fieldErrors[field]) : undefined;

  /*
    On success, go wherever this person was being kept out of.

    Only meaningful on `/new-password`: `requireUser()` was bouncing them here,
    the flag is now cleared, and `refresh()` re-runs that guard so the redirect
    stops happening. In Settings the same call is a no-op worth paying for --
    the panel is already on a page they are allowed to be on.
  */
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <PasswordField
        name="currentPassword"
        label={t("currentPassword")}
        autoComplete="current-password"
        error={fieldError("currentPassword")}
      />
      <PasswordField
        name="newPassword"
        label={t("newPassword")}
        hint={t("passwordHint")}
        autoComplete="new-password"
        error={fieldError("newPassword")}
      />
      <PasswordField
        name="confirmPassword"
        label={t("confirmPassword")}
        autoComplete="new-password"
        error={fieldError("confirmPassword")}
      />

      <div aria-live="polite" className="empty:hidden">
        {state.error ? (
          <p className="text-body text-blocked-text">{t(state.error)}</p>
        ) : state.ok ? (
          <p className="text-body text-complete-text">{t("passwordChanged")}</p>
        ) : null}
      </div>

      <Button type="submit" variant="primary" loading={pending} className="w-fit">
        {submitLabel ?? t("changePassword")}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const t = useTranslations("Auth");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("changePassword")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <ChangePasswordFields />
      </CardContent>
    </Card>
  );
}

/**
 * The same form, on the screen somebody is held at until they use it.
 *
 * No card of its own -- `AuthCard` is the frame there -- and a submit label
 * that reads as finishing something rather than as an optional settings
 * change.
 */
export function ForcedPasswordChangeForm() {
  const t = useTranslations("Auth");
  return <ChangePasswordFields submitLabel={t("setPasswordAndContinue")} />;
}
