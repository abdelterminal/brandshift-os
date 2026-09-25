import type { Tone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The head of a queue lane.
 *
 * The count is the thing anyone actually scans for, so it carries the state
 * instead of a badge sitting beside the title -- a large figure in the tone's
 * own text colour, over a flat tint of the same tone. That tint is the same
 * `bg-*-bg` surface `NextTaskPanel` already uses a few lines away, rather than
 * anything gradient: the app has no gradients and this is not the place to
 * introduce one.
 *
 * Every class resolves through the status tokens, which `tokens.css` already
 * redefines for dark, so one class string is correct in both themes and
 * nothing here needs a `dark:` variant.
 *
 * Tone classes are written out in full rather than composed from the tone
 * name, for the reason `badge.tsx` gives: Tailwind scans source text, so
 * `text-${tone}-text` would generate no CSS at all.
 */

const FIGURE: Record<Tone, string> = {
  // Unassigned carries no colour of its own -- nothing in the palette means
  // "nobody has this" -- so it leans on the default ink rather than borrowing
  // blue, which is spoken for by active/in-progress.
  neutral: "text-fg-default",
  complete: "text-complete-text",
  attention: "text-attention-text",
  active: "text-active-text",
  blocked: "text-blocked-text",
  accent: "text-accent-text",
};

const TINT: Record<Tone, string> = {
  neutral: "bg-surface-inset",
  complete: "bg-complete-bg",
  attention: "bg-attention-bg",
  active: "bg-active-bg",
  blocked: "bg-blocked-bg",
  accent: "bg-accent-subtle",
};

export function QueueLaneHeader({
  title,
  description,
  count,
  tone,
}: {
  title: string;
  description: string;
  count: number;
  tone: Tone;
}) {
  /**
   * An empty lane goes quiet rather than neutral-coloured. Dropping it to the
   * same grey a neutral lane uses made "3 unassigned" and "0 no plan" look
   * identical, which is the opposite of the point: the lane with work in it has
   * to be the one that reads.
   */
  const empty = count === 0;

  return (
    <div className={cn("border-border border-b px-4 py-3", empty ? "bg-surface-inset" : TINT[tone])}>
      <div className="flex items-baseline gap-2.5">
        <span
          className={cn(
            "text-display font-display leading-none tabular-nums",
            empty ? "text-fg-subtle" : FIGURE[tone],
          )}
        >
          {count}
        </span>
        <h3 className="text-heading font-display text-fg-default min-w-0 truncate">{title}</h3>
      </div>
      <p className="text-caption text-fg-muted mt-1.5">{description}</p>
    </div>
  );
}
