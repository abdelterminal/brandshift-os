import { defineRouting } from "next-intl/routing";

/**
 * `en` and `fr`, both complete. Actual users work in French, so neither is a
 * translation of the other -- a screen ships with both or it does not ship.
 *
 * `localePrefix: "always"` keeps the locale in the URL for every route, so a
 * link someone pastes into a chat opens in the language they were reading.
 */
export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};
