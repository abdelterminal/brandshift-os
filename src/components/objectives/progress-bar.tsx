import { cn } from "@/lib/utils";

/**
 * How far along a key result is.
 *
 * Widths come from a literal table in 5% steps rather than an inline `style`,
 * for the two reasons the Insights chart already established: inline styles are
 * forbidden here, and Tailwind generates its classes from literal source
 * strings, so a computed `w-[${n}%]` produces no CSS at all.
 *
 * Twenty steps is enough. This is a bar somebody glances at to see whether a
 * number is roughly where it should be; the exact figure is printed beside it,
 * where it can be read rather than estimated.
 */
const WIDTHS = [
  "w-0",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-full",
] as const;

export type BarTone = "on_track" | "at_risk" | "behind" | "done" | "not_measured";

/**
 * Colour carries the same meanings it does everywhere else in this app: green
 * is complete, amber is needs attention, blue is in progress. Red is not used
 * -- it is reserved for blocked and overdue, and a goal that is behind is
 * neither. Spending the accent on a number that is merely disappointing is how
 * red stops meaning anything.
 */
const TONE: Record<BarTone, string> = {
  done: "bg-status-complete-solid",
  on_track: "bg-status-active-solid",
  at_risk: "bg-status-attention-solid",
  behind: "bg-status-attention-solid",
  not_measured: "bg-border",
};

export function ProgressBar({
  percent,
  tone,
  label,
  className,
}: {
  /** 0-100, or `null` when nobody has measured it. */
  percent: number | null;
  tone: BarTone;
  /** Names the bar for a screen reader; the visible figure sits beside it. */
  label: string;
  className?: string;
}) {
  const step = percent === null ? 0 : Math.round(Math.min(100, Math.max(0, percent)) / 5);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      // Omitted rather than zero when unmeasured: a screen reader should say
      // "not measured", not "nought percent". They are different facts.
      aria-valuenow={percent ?? undefined}
      aria-label={label}
      className={cn("bg-surface-sunken h-2 w-full overflow-hidden rounded-full", className)}
    >
      <div className={cn("h-full rounded-full", TONE[tone], WIDTHS[step])} />
    </div>
  );
}
