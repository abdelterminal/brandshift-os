import { Children, isValidElement } from "react";
import { useTranslations } from "next-intl";
import { Field as FieldPrimitive } from "@base-ui/react/field";

import { cn } from "@/lib/utils";

/**
 * Form field scaffolding: label, control, description, error.
 *
 * Base UI wires the `for`/`id`/`aria-describedby` relationships between these
 * parts, so a label is always a real label. The old app's login screen had
 * placeholder text standing in for labels, which disappears the moment someone
 * starts typing and leaves a screen reader with nothing.
 */

function Field({ className, children, ...props }: FieldPrimitive.Root.Props) {
  const ui = useTranslations("Ui");
  const required = Children.toArray(children).some(child => isValidElement<{ required?: boolean }>(child) && child.props.required);
  // The annotation wraps the label as a sibling rather than joining it as a
  // child: text inside `<label>` is folded into its accessible name, so
  // "Email" would become "Email · Required" for anything that asks by
  // name -- a screen reader included. Wrapping, not cloning, is also what
  // keeps FieldLabel's own children untouched.
  const labelled = Children.map(children, child => isValidElement(child) && child.type === FieldLabel
    ? (
      <span className="flex items-baseline gap-1">
        {child}
        <span aria-hidden="true" className="text-caption text-fg-muted">
          · {ui(required ? "required" : "optional")}
        </span>
      </span>
    )
    : child);
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex w-full flex-col gap-1.5", className)}
      {...props}
    >{labelled}</FieldPrimitive.Root>
  );
}

function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(
        "text-label text-fg-default w-fit data-disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}

/** Helper text. Sits under the control so it does not push the label away. */
function FieldDescription({ className, ...props }: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn("text-caption text-fg-muted", className)}
      {...props}
    />
  );
}

/**
 * Validation message. Rendered only when the field is actually invalid, and
 * announced -- colour alone would leave the error invisible to anyone who
 * cannot distinguish it.
 */
function FieldError({ className, ...props }: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={cn("text-caption text-blocked-text", className)}
      {...props}
    />
  );
}

/** Marks a field as required, for the eye and the reader alike. */
function FieldRequired({ className }: { className?: string }) {
  return (
    <span className={cn("text-accent-text", className)} aria-hidden>
      {" *"}
    </span>
  );
}

export { Field, FieldLabel, FieldDescription, FieldError, FieldRequired };
