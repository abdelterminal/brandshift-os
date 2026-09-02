import { Field as FieldPrimitive } from "@base-ui/react/field";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

import { disabled, focusRing, transition } from "./styles";

/**
 * Text input.
 *
 * The border is `--border-control`, the one line token held to 3:1 against the
 * surface, because on an empty field that border is the only thing saying a
 * control is there at all.
 */
const inputClassName = cn(
  "h-9 w-full rounded-control px-3 text-body",
  "bg-surface-raised text-fg-default border-border-control border",
  "placeholder:text-fg-subtle",
  "hover:border-border-hover",
  // `data-invalid` comes from Field; `aria-invalid` covers standalone use.
  "data-invalid:border-blocked-solid aria-invalid:border-blocked-solid",
  focusRing,
  disabled,
  transition,
);

function Input({ className, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive data-slot="input" className={cn(inputClassName, className)} {...props} />
  );
}

/**
 * Multi-line input. Same skin, free to grow.
 *
 * Rendered through `Field.Control` rather than as a bare `<textarea>`, so that
 * inside a `Field` it actually joins it: the label points at it, the
 * description and error are wired to it by `aria-describedby`, and validity
 * flows through.
 *
 * As a plain `<textarea>` it did none of that. A `Field` around it rendered a
 * label that pointed at nothing, and the control's only accessible name came
 * from its placeholder -- the exact fault the login page was rebuilt to fix,
 * reintroduced one component along. Outside a `Field` it behaves as before.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <FieldPrimitive.Control
      render={<textarea />}
      data-slot="textarea"
      className={cn(inputClassName, "min-h-20 resize-y py-2 leading-[var(--leading-body)]", className)}
      // `Field.Control`'s own props are typed for an `<input>`, so its event
      // handlers disagree with a textarea's. The component's public signature
      // above is the textarea one, which is what callers see; the cast is only
      // to hand them across.
      {...(props as Record<string, unknown>)}
    />
  );
}

export { Input, Textarea, inputClassName };
