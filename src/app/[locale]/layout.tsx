import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { themeScript } from "@/components/theme";
import { routing } from "@/i18n/routing";

import { fontVariables } from "../fonts";
import "../globals.css";

/**
 * Root layout for the product. `/design` has its own -- it sits outside the
 * locale tree because it is an internal tool rather than a screen.
 */

export const metadata: Metadata = {
  title: {
    default: "BrandShift OS",
    template: "%s -- BrandShift OS",
  },
  description: "ERP, CRM and team collaboration for BrandShift.",
};

export const viewport: Viewport = {
  // The canvas colour of each theme, so the browser chrome matches the app
  // instead of flashing white behind it.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1615" },
  ],
};

/** Both locales are known at build time, so both are prerendered. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Lets pages below this one stay static rather than opting into dynamic
  // rendering the moment they read a translation.
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/*
          Must run before first paint, or a dark-theme user gets a white flash.
          React hoists `<script src>` but not an inline one, so this needs a
          real <head> rather than being dropped anywhere in the tree.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
