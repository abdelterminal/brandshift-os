"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import { focusRing, transition } from "../ui/styles";

/**
 * Password input with a visibility toggle.
 *
 * The old login screen had three faults this fixes:
 *
 *   - the label was placeholder text, which vanishes the moment you type and
 *     leaves a screen reader announcing nothing;
 *   - the eye icon was an unlabelled `<div>`, unreachable by keyboard and
 *     announced as nothing at all;
 *   - the error was colour on the border, with no text and no announcement.
 *
 * So: a real `<label for>`, a real `<button>` whose name says which way it
 * will go and whose `aria-pressed` says which way it is now, and an error
 * that is text, tied to the input by `aria-describedby`, in a live region.
 */
export function PasswordField({
  name,
  label,
  hint,
  error,
  autoComplete = "current-password",
  required = true,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  autoComplete?: "current-password" | "new-password";
  required?: boolean;
  defaultValue?: string;
}) {
  const t = useTranslations("Auth");
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label text-fg-default w-fit">
        {label}
      </label>

      <div
        className={cn(
          "flex h-9 items-center rounded-control border pr-1 pl-3",
          "bg-surface-raised border-border-control",
          "hover:border-border-hover",
          "has-focus-visible:outline-focus-ring has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
          error && "border-blocked-solid",
          transition,
        )}
      >
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          defaultValue={defaultValue}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="text-body text-fg-default placeholder:text-fg-subtle min-w-0 flex-1 bg-transparent outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((previous) => !previous)}
          // The name describes the action, and `aria-pressed` carries the
          // state, so the button is not announced as two different controls.
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          aria-controls={id}
          className={cn(
            "text-fg-subtle hover:text-fg-default hover:bg-surface-hover",
            "inline-flex size-7 shrink-0 items-center justify-center rounded-[6px]",
            focusRing,
            transition,
          )}
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>

      {hint ? (
        <p id={hintId} className="text-caption text-fg-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-caption text-blocked-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The same treatment for the non-secret fields, so a form reads as one thing. */
export function TextField({
  name,
  label,
  type = "text",
  hint,
  error,
  autoComplete,
  required = true,
  defaultValue,
  value,
  onValueChange,
  placeholder,
  autoFocus,
}: {
  name: string;
  label: string;
  type?: "text" | "email";
  hint?: string;
  error?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  /** Pass `value` and `onValueChange` together to control the field. */
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label text-fg-default w-fit">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        {...(onValueChange
          ? { value: value ?? "", onChange: (event) => onValueChange(event.target.value) }
          : { defaultValue })}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "h-9 w-full rounded-control px-3 text-body",
          "bg-surface-raised text-fg-default border-border-control border",
          "placeholder:text-fg-subtle hover:border-border-hover",
          error && "border-blocked-solid",
          focusRing,
          transition,
        )}
      />
      {hint ? (
        <p id={hintId} className="text-caption text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption text-blocked-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
