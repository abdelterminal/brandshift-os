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

function Field({ className, ...props }: FieldPrimitive.Root.Props) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex w-full flex-col gap-1.5", className)}
      {...props}
    />
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
