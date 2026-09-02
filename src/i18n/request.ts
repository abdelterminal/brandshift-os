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
    /**
     * The reference point for every relative time on the page.
     *
     * Without it each `relativeTime` call reaches for the current clock, so
     * the server renders "2 seconds ago" and the client re-renders "3 seconds
     * ago" -- a hydration mismatch that appears only sometimes, which is the
     * worst kind. Fixing it per request makes both halves agree.
     */
    now: new Date(),
  };
});
