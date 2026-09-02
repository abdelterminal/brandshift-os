"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { signIn, type FormState } from "@/lib/auth/actions";

import { PasswordField, TextField } from "./password-field";

/**
 * Sign in.
 *
 * One error message for both halves of the credential. Saying "no such
 * account" would confirm which email addresses are registered here, which is
 * how a list of employees leaks out of a login page.
 *
 * The error sits in a live region so it is announced when it appears, not only
 * when someone happens to move focus over it.
 */
export function SignInForm({ next }: { next?: string }) {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<FormState, FormData>(signIn, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <TextField
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        autoFocus
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email ? t(state.fieldErrors.email) : undefined}
      />

      <PasswordField
        name="password"
        label={t("password")}
        autoComplete="current-password"
        error={state.fieldErrors?.password ? t(state.fieldErrors.password) : undefined}
      />

      <div aria-live="polite" className="empty:hidden">
        {state.error ? (
          <p className="text-body text-blocked-text bg-blocked-bg border-blocked-border rounded-control border px-3 py-2">
            {t(state.error)}
          </p>
        ) : null}
      </div>

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
