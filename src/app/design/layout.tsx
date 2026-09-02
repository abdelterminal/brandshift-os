import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle, themeScript } from "@/components/theme";

import { fontVariables } from "../fonts";
import "../globals.css";

/**
 * Root layout for the design system reference.
 *
 * Internal, not part of the product, and deliberately not locale-scoped -- it
 * is a tool for building the app rather than a screen in it, which is why it
 * carries its own <html> instead of sitting under `[locale]`.
 */

export const metadata: Metadata = { title: "Design system" };

const navLink =
  "text-label text-fg-muted hover:bg-surface-hover hover:text-fg-default focus-visible:outline-focus-ring rounded-control px-2.5 py-1.5 transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2";

export default function DesignLayout({ children }: LayoutProps<"/design">) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-surface-base flex min-h-full flex-col">
        <header className="border-border bg-surface-base/90 sticky top-0 z-40 border-b backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
            <nav className="flex items-center gap-1" aria-label="Design system">
              <Link href="/design" className={navLink}>
                Tokens
              </Link>
              <Link href="/design/primitives" className={navLink}>
                Primitives
              </Link>
            </nav>
            <ThemeToggle />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
