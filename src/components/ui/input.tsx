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

/** Multi-line input. Same skin, free to grow. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClassName, "min-h-20 resize-y py-2 leading-[var(--leading-body)]", className)}
      {...props}
    />
  );
}

export { Input, Textarea, inputClassName };
