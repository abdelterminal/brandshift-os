import { cn } from "@/lib/utils";

/**
 * The loading indicator every control shares.
 *
 * `data-spinner` exempts it from the global reduced-motion override in
 * globals.css. Freezing a spinner would leave someone who asked for less
 * motion staring at a static ring with no way to tell whether anything is
 * happening, which is worse than the motion. It is the one thing on the page
 * allowed to keep moving; the accessible name below carries the same
 * information for anyone who cannot see it at all.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      data-spinner
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-4 shrink-0 animate-spin", className)}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
