import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Locale negotiation.
 *
 * M4 adds the session check here -- the cookie JWT plus the `sessions` digest
 * lookup -- which is why this lives at the edge of the app rather than being
 * folded into a layout.
 *
 * It must sit in `src/`, not the repo root: Next looks for middleware beside
 * `app/`, and this project keeps `app/` under `src/`.
 */
export default createMiddleware(routing);

export const config = {
  /**
   * Three patterns rather than one, which is the form next-intl documents.
   *
   * The single-string equivalent looks identical but is not: Next 16 quietly
   * fails to match anything once the lookahead contains the `.*\..*`
   * alternative, so `/today` was never reaching the middleware and 404ed
   * instead of redirecting to `/en/today`. Split like this, it works.
   *
   * `api` is not locale-scoped, and `design` is an internal tool rather than a
   * screen -- neither should be given a language prefix.
   */
  matcher: ["/", "/(en|fr)/:path*", "/((?!api|design|_next|_vercel|.*\\..*).*)"],
};
