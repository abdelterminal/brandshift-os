import localFont from "next/font/local";

/**
 * Self-hosted type. The woff2 files live in `./fonts/` and ship with the repo,
 * so a build needs no network and a running app makes no third-party request.
 *
 * Both are variable fonts: one file covers the whole weight range, which is why
 * there is no separate file per weight.
 *
 * Each family is declared twice, latin and latin-ext. `next/font/local` has no
 * way to express `unicode-range`, so coverage is handled by the font stack
 * instead: the browser tries latin first and falls through to latin-ext only
 * for a glyph latin does not have. latin alone covers `en` and `fr` completely
 * -- accents, the oe ligature, guillemets and the euro sign -- so the ext file
 * is fetched only for a name from outside those alphabets, which is exactly
 * when a CRM needs it.
 */

export const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
});

export const interExt = localFont({
  src: "./fonts/inter-latin-ext.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter-ext",
  // Only some names need it, so it is not worth a render-blocking preload.
  preload: false,
  adjustFontFallback: false,
});

export const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  weight: "300 700",
  style: "normal",
  display: "swap",
  variable: "--font-space-grotesk",
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
});

export const spaceGroteskExt = localFont({
  src: "./fonts/space-grotesk-latin-ext.woff2",
  weight: "300 700",
  style: "normal",
  display: "swap",
  variable: "--font-space-grotesk-ext",
  preload: false,
  adjustFontFallback: false,
});

/** Every font variable, for the `<html>` class. */
export const fontVariables = [
  inter.variable,
  interExt.variable,
  spaceGrotesk.variable,
  spaceGroteskExt.variable,
].join(" ");
