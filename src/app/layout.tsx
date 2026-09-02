import type { Metadata, Viewport } from "next";

import { themeScript } from "@/components/theme";

import { fontVariables } from "./fonts";
import "./globals.css";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/*
          Must run before first paint, or a dark-theme user gets a white flash.
          React hoists `<script src>` but not an inline one, so this needs a
          real <head> rather than being dropped anywhere in the tree.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
