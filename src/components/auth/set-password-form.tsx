"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setPassword } from "@/lib/actions/accept";

/**
 * Choosing a password from a one-time link.
 *
 * The confirm field is checked here rather than on the server, because it is
 * not a server concern: the server has one password and no opinion about
 * whether the person typed it twice. Everything the server *does* decide --
 * length, and whether the link is still good -- comes back as an error from it.
 */
export function SetPasswordForm({
  token,
  purpose,
}: {
  token: string;
  purpose: "invite" | "reset";
}) {
  const t = useTranslations("Accept");

  const [password, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    if (password.length < 10) {
      setError(t("tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await setPassword({ token, purpose, password });
      // Success redirects and signs in, so anything returned is a refusal.
      if (result) setError(result.error === "tooShort" ? t("tooShort") : t("failed"));
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="confirm">{t("confirm")}</FieldLabel>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>

      {error ? (
        <p role="alert" className="text-body text-status-blocked-text">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {pending ? t("signingIn") : t("submit")}
      </Button>
    </form>
  );
}
