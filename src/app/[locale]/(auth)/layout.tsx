import { getTranslations } from "next-intl/server";

import { ThemeToggle } from "@/components/theme";
import { LocaleSwitcher } from "@/components/shell/switchers";
import { Wordmark } from "@/components/brand/wordmark";
import { withBasePath } from "@/lib/base-path";

/**
 * The signed-out frame.
 *
 * No rail, no palette, no organization -- none of it means anything before we
 * know who you are. Theme and language stay, because someone should be able to
 * read the sign-in page in their own language and without being flashbanged.
 *
 * The brand panel only shows up at `lg:` -- below that there isn't room for a
 * second column without squeezing the form, so the small-screen path stays
 * exactly what it was: `AuthCard`'s own wordmark, full width.
 */
export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("Auth");

  return (
    <div className="bg-surface-sunken flex min-h-dvh flex-col lg:flex-row">
      <aside
        className="border-border bg-surface-base relative isolate hidden shrink-0 overflow-hidden border-r lg:flex lg:w-[38%] lg:flex-col lg:p-10 xl:w-[34%]"
        aria-hidden
      >
        {/* The icon, not the tiled motif -- the motif sheet bakes in an
            opaque white backing, which washes out to nothing at low opacity
            on a dark surface. The icon's background is real transparency, so
            it reads as a faint colour watermark on either theme. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static
            asset, decorative background flourish, no JS needed. */}
        <img
          src={withBasePath("/brand/mediast-icon.svg")}
          alt=""
          className="pointer-events-none absolute -top-20 -right-28 -z-10 size-[28rem] opacity-[0.14] select-none"
        />
        <Wordmark className="h-8 w-auto" />
        <div className="flex flex-1 items-center">
          <p className="text-heading-lg font-display text-fg-default max-w-sm">{t("brandTagline")}</p>
        </div>
      </aside>

      <div className="relative isolate flex flex-1 flex-col overflow-hidden">
        {/* A second, much fainter copy of the same watermark, so the card at
            `lg:` -- which now has a translucent, blurred surface -- has actual
            texture behind it to diffuse. Same asset and technique as the
            aside's own, just far fainter so it never competes with the brand
            panel. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset,
            no JS needed for a background flourish. */}
        <img
          src={withBasePath("/brand/mediast-icon.svg")}
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[36rem] -translate-x-1/2 -translate-y-1/2 opacity-[0.05] select-none"
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
    </div>
  );
}
