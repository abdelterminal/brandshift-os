import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge and StatusPill.
 *
 * The tone vocabulary is closed on purpose. Green means complete, amber means
 * needs attention, blue means in progress, red means blocked or overdue, and
 * none of them ever means anything else. A screen that wants a fifth meaning
 * needs a fifth word, not a spare colour.
 *
 * Class strings are written out rather than composed from the tone name --
 * Tailwind scans source text for complete class names, so `bg-${tone}-bg`
 * would generate nothing at all.
 */

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border text-label",
  {
    variants: {
      tone: {
        neutral: "bg-status-neutral-bg text-status-neutral-text border-status-neutral-border",
        complete: "bg-complete-bg text-complete-text border-complete-border",
        attention: "bg-attention-bg text-attention-text border-attention-border",
        active: "bg-active-bg text-active-text border-active-border",
        blocked: "bg-blocked-bg text-blocked-text border-blocked-border",
        accent: "bg-accent-subtle text-accent-text border-accent-border",
      },
      size: {
        sm: "px-2 py-0.5 text-caption",
        md: "px-2.5 py-1",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

const DOT: Record<Tone, string> = {
  neutral: "bg-status-neutral-solid",
  complete: "bg-complete-solid",
  attention: "bg-attention-solid",
  active: "bg-active-solid",
  blocked: "bg-blocked-solid",
  accent: "bg-accent",
};

function Badge({
  className,
  tone,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    />
  );
}

/**
 * A badge with a status dot.
 *
 * The dot is not decoration: it gives the status a second, non-colour signal
 * of position and shape, so the four tones stay distinguishable to someone who
 * cannot separate them by hue. The label always carries the actual meaning.
 */
function StatusPill({
  className,
  tone = "neutral",
  size,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="status-pill"
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    >
      <span className={cn("size-1.5 shrink-0 rounded-pill", DOT[tone ?? "neutral"])} aria-hidden />
      {children}
    </span>
  );
}

/**
 * Counts and totals. Neutral by default, because a number is not a status --
 * `tone` is for the ones that genuinely are, like an overdue count.
 */
function CountBadge({
  className,
  tone = "neutral",
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="count-badge"
      className={cn(
        badgeVariants({ tone, size: "sm" }),
        "min-w-5 justify-center tabular-nums",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge, CountBadge, StatusPill, badgeVariants };
