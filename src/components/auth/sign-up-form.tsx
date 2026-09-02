"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { signUpWithOrg, type FormState } from "@/lib/auth/actions";

import { PasswordField, TextField } from "./password-field";

/**
 * Create an organization and its owner in one step.
 *
 * There is no "join an existing organization" here: you get in by invitation,
 * which is the only way membership of someone else's tenant can be legitimate.
 */
export function SignUpForm() {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<FormState, FormData>(signUpWithOrg, {});

  const fieldError = (field: string) =>
    state.fieldErrors?.[field] ? t(state.fieldErrors[field]) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <TextField
        name="organizationName"
        label={t("organizationName")}
        autoComplete="organization"
        autoFocus
        defaultValue={state.values?.organizationName}
        error={fieldError("organizationName")}
      />
      <TextField
        name="name"
        label={t("yourName")}
        autoComplete="name"
        defaultValue={state.values?.name}
        error={fieldError("name")}
      />
      <TextField
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        defaultValue={state.values?.email}
        error={fieldError("email")}
      />
      <PasswordField
        name="password"
        label={t("password")}
        hint={t("passwordHint")}
        autoComplete="new-password"
        error={fieldError("password")}
      />

      <div aria-live="polite" className="empty:hidden">
        {state.error ? (
          <p className="text-body text-blocked-text bg-blocked-bg border-blocked-border rounded-control border px-3 py-2">
            {t(state.error)}
          </p>
        ) : null}
      </div>

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {pending ? t("creatingAccount") : t("createAccount")}
      </Button>
    </form>
  );
}
