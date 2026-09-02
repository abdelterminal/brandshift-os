import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Spinner } from "./spinner";
import { disabled, focusRing, transition } from "./styles";

/**
 * Button.
 *
 * Six states, every variant: default, hover, focus-visible, active, disabled
 * and loading. The pressed state changes colour rather than position -- the
 * scaffolded default nudged the button down a pixel on `:active`, which is a
 * transform and makes a toolbar of buttons twitch under the cursor.
 *
 * Only `primary` and `destructive` are red, and a screen should hold one of
 * them at a time. That is most of the 5% budget.
 */
const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control",
    "border border-transparent whitespace-nowrap select-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    focusRing,
    disabled,
    transition,
  ),
  {
    variants: {
      variant: {
        /** The one action a screen most wants you to take. */
        primary:
          "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active",
        /** The default for everything else. Reads as a control, not a link. */
        secondary:
          "bg-surface-raised text-fg-default border-border hover:bg-surface-hover hover:border-border-hover active:bg-surface-active",
        /** Toolbars and table rows, where a border per button would be noise. */
        ghost:
          "text-fg-muted hover:bg-surface-hover hover:text-fg-default active:bg-surface-active",
        /**
         * Destructive shares the accent because red already means "careful".
         * It is visually identical to primary on purpose: the difference that
         * matters is the confirmation it triggers, not the shade.
         */
        destructive:
          "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active",
        /** Inline in prose. Underlines on hover so it is not colour-only. */
        link: "text-accent-text underline-offset-4 hover:underline active:text-accent-active h-auto p-0",
      },
      size: {
        /** 32px. Table rows and toolbars. */
        sm: "h-8 px-2.5 text-label",
        /** 36px. The default. */
        md: "h-9 px-3.5 text-label",
        /** 40px. Page-level primary actions and empty states. */
        lg: "h-10 px-4 text-body",
        /** Square, for an icon alone. Needs an accessible name. */
        "icon-sm": "size-8",
        icon: "size-9",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /**
     * Shows a spinner and blocks interaction while keeping the button's width,
     * so a row of buttons does not reflow the moment one is pressed.
     */
    loading?: boolean;
  };

function Button({
  className,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled: isDisabled,
  children,
  ...props
}: ButtonProps) {
  const iconOnly = typeof size === "string" && size.startsWith("icon");

  return (
    <ButtonPrimitive
      data-slot="button"
      // Announce the wait; a spinner alone says nothing to a screen reader.
      aria-busy={loading || undefined}
      // Loading blocks clicks the same way disabled does, but must not *look*
      // disabled: greyed out says "you cannot do this", where the truth is
      // "this is happening". So the dimming is put back while loading, and the
      // spinner plus a softened label carry the state instead.
      disabled={isDisabled || loading}
      className={cn(
        buttonVariants({ variant, size }),
        loading && "disabled:opacity-100 data-disabled:opacity-100",
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <Spinner className={cn(size === "lg" ? "size-4.5" : "size-4")} />
          {/* The label stays in the flow so the button keeps its width. */}
          {iconOnly ? null : <span className="opacity-70">{children}</span>}
          <span className="sr-only">Loading</span>
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
