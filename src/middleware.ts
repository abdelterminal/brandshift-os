import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";
import { routing } from "@/i18n/routing";

/**
 * Locale negotiation and the front door.
 *
 * What happens here: the locale is resolved, and the session cookie's
 * signature and expiry are verified. That is enough to route -- to send a
 * stranger to sign in, and to keep a signed-in person off the sign-in page.
 *
 * What deliberately does not happen here: the `sessions` digest lookup. It
 * would put a database round trip, and a second connection pool, in front of
 * every request including static assets. Instead `requireUser()` does the full
 * check -- digest, revocation, expiry, password-change invalidation -- and the
 * `(app)` layout calls it on every render, so a revoked session still cannot
 * see a single page. The middleware is a routing decision; the page is the
 * security boundary.
 *
 * The practical difference is one wasted redirect for a cookie that is signed
 * but no longer live: middleware waves it through, the page refuses it and
 * renders `unauthorized.tsx`, which clears the cookie.
 */

const intlMiddleware = createMiddleware(routing);

/** Reachable without a session. Everything else is not. */
const PUBLIC_PATHS = ["/login", "/signup"];

function stripLocale(pathname: string): string {
  const match = /^\/(en|fr)(\/.*)?$/.exec(pathname);
  return match ? (match[2] ?? "/") : pathname;
}

function localeOf(pathname: string): string {
  const match = /^\/(en|fr)(?:\/|$)/.exec(pathname);
  return match?.[1] ?? routing.defaultLocale;
}

export default async function middleware(request: NextRequest) {
  // next-intl first: it may redirect to add a locale prefix, and every
  // decision below is made in terms of the locale it settles on.
  const response = intlMiddleware(request);
  if (response.headers.get("location")) return response;

  const { pathname } = request.nextUrl;
  const locale = localeOf(pathname);
  const path = stripLocale(pathname);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  const isPublic = PUBLIC_PATHS.some((entry) => path === entry || path.startsWith(`${entry}/`));

  if (!claims && !isPublic) {
    const url = new URL(`/${locale}/login`, request.url);
    // Remember where they were headed, so signing in finishes the journey
    // rather than dumping everyone on Today.
    if (path !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (claims && isPublic) {
    return NextResponse.redirect(new URL(`/${locale}/today`, request.url));
  }

  return response;
}

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
   * screen -- neither should be given a language prefix, and neither is gated.
   */
  matcher: ["/", "/(en|fr)/:path*", "/((?!api|design|_next|_vercel|.*\\..*).*)"],
};
