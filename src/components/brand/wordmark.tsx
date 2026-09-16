import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

/**
 * The full "mediast creative" lockup, light and dark.
 *
 * Two files, not one recoloured with CSS: the wordmark's black/white text is
 * baked into each SVG alongside the red dot and blue mark, so swapping the
 * whole file is simpler and more faithful than trying to reach into a
 * third-party-exported SVG's fills. Uses the app's own `dark:` variant
 * (`src/app/globals.css`) -- the same `data-theme` / `prefers-color-scheme`
 * rule every token already resolves through, not a separate mechanism.
 *
 * No JS: both images ship in the HTML and the inactive one is hidden by CSS,
 * so this never flashes the wrong theme and works from a Server Component.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static
          asset under public/, not a tenant-supplied URL; next/image buys
          nothing here and this must render with zero JS. */}
      <img
        src={withBasePath("/brand/mediast-wordmark.svg")}
        alt="mediast creative"
        className={cn("dark:hidden", className)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={withBasePath("/brand/mediast-wordmark-dark.svg")}
        alt="mediast creative"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}
