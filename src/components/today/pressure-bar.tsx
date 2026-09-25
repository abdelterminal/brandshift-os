import type { Tone } from "@/components/ui/badge";
import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The day's queue as one proportional bar.
 *
 * Four tiles each showing a number told you the counts but never their shape:
 * fourteen overdue beside six blocked reads very differently from six and six,
 * and that ratio is the thing a coordinator is actually judging. One stacked
 * bar carries both at a glance, in a single line instead of four.
 *
 * Every figure here is a count of rows that exist, and every legend entry is a
 * link to them -- the same `/work/queue?bucket=` route the tiles used. A number
 * on this screen has to be reachable, or it is the vanity total CLAUDE.md
 * refuses.
 *
 * Tone classes are written out in full, not composed: Tailwind scans source
 * text, so `bg-${tone}-solid` would generate nothing (see `badge.tsx`).
 */

const SOLID: Record<Tone, string> = {
  neutral: "bg-status-neutral-solid",
  complete: "bg-complete-solid",
  attention: "bg-attention-solid",
  active: "bg-active-solid",
  blocked: "bg-blocked-solid",
  accent: "bg-accent",
};

export type PressureSegment = {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: Tone;
};

export function PressureBar({
  segments,
  heading,
  summary,
}: {
  segments: PressureSegment[];
  heading: string;
  /** Already interpolated by the caller, which holds the translator. */
  summary: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  // Nothing in the queue is its own message, and the empty state below says
  // it better than a bar of zeroes would.
  if (total === 0) return null;

  const filled = segments.filter((segment) => segment.count > 0);

  return (
    <section
      className="border-border bg-surface-raised rounded-surface border p-4 shadow-card"
      aria-label={heading}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-label text-fg-default font-semibold">{heading}</h2>
        <p className="text-caption text-fg-muted tabular-nums">{summary}</p>
      </div>

      <div className="bg-surface-inset mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-pill">
        {filled.map((segment) => (
          <span
            key={segment.key}
            // The one place a computed value has to reach CSS. Custom property
            // rather than an inline style rule, the exception `globals.css`
            // already documents for `--pane-width` and `--dash`.
            style={{ "--share": `${(segment.count / total) * 100}%` } as React.CSSProperties}
            className={cn("w-[var(--share)]", SOLID[segment.tone])}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((segment) => (
          <li key={segment.key}>
            <Link
              href={segment.href}
              className={cn(
                "text-caption text-fg-muted hover:text-fg-default rounded-control flex items-center gap-2 px-1 py-0.5",
                focusRing,
                transition,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-pill",
                  segment.count > 0 ? SOLID[segment.tone] : SOLID.neutral,
                )}
              />
              <span className="text-fg-default font-display font-semibold tabular-nums">
                {segment.count}
              </span>
              {segment.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
