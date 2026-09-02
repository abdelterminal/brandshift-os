"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changePassword, type FormState } from "@/lib/auth/actions";

import { PasswordField } from "./password-field";

/**
 * Change password.
 *
 * The current password is required, which doubles as the re-authentication --
 * there is no second prompt on top of it. Succeeding signs out every other
 * device, and says so before you press the button rather than afterwards.
 */
export function ChangePasswordForm() {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<FormState, FormData>(changePassword, {});

  const fieldError = (field: string) =>
    state.fieldErrors?.[field] ? t(state.fieldErrors[field]) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("changePassword")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <form action={formAction} className="flex max-w-sm flex-col gap-4" noValidate>
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
            {t("changePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
