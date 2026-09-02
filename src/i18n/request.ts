import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Resolves the locale for a request and loads its messages.
 *
 * Messages are one file per locale rather than per namespace: with only two
 * locales, a single file per language is what makes a missing translation
 * obvious in a diff.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Deadlines and "due today" are read in the organization's timezone.
    timeZone: "Europe/Paris",
  };
});
