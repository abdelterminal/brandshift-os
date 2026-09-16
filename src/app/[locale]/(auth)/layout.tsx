import { ThemeToggle } from "@/components/theme";
import { LocaleSwitcher } from "@/components/shell/switchers";
import { withBasePath } from "@/lib/base-path";

/**
 * The signed-out frame.
 *
 * No rail, no palette, no organization -- none of it means anything before we
 * know who you are. Theme and language stay, because someone should be able to
 * read the sign-in page in their own language and without being flashbanged.
 *
 * One full-bleed surface, no side panel -- `AuthCard`'s own wordmark carries
 * the brand at every width now, so there's nothing left for a second column
 * to hold.
 */
export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="bg-surface-sunken relative isolate flex min-h-dvh w-full flex-col overflow-hidden">
      {/* The tiled motif, covering the whole page -- `object-cover` keeps
          its own tiling uniform (no stretch/distortion) while it scales to
          fill whatever the viewport's real aspect ratio is. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset,
          no JS needed for a background flourish. */}
      <img
        src={withBasePath("/brand/mediast-motif.svg")}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.05] select-none"
      />
      {/* Static soft-focus atmosphere -- the compliant stand-in for a
          floating-blob background: same depth, zero motion. Built from
          `--fg-subtle` (a semantic token, never a primitive/raw hex), with
          a `dark:` bump so dark mode reads moodier, matching the deliberate
          light/dark asymmetry chosen for this pass. */}
      <div
        aria-hidden
        className="bg-fg-subtle/[0.06] dark:bg-fg-subtle/[0.1] pointer-events-none absolute -top-24 -right-16 -z-10 size-[26rem] rounded-full blur-3xl select-none"
      />
      <div
        aria-hidden
        className="bg-fg-subtle/[0.05] dark:bg-fg-subtle/[0.08] pointer-events-none absolute -bottom-32 -left-10 -z-10 size-[22rem] rounded-full blur-3xl select-none"
      />
      <header className="flex items-center justify-end gap-1 px-4 py-3">
        <LocaleSwitcher />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 sm:items-center sm:pb-24">
        {children}
      </main>
    </div>
  );
}
