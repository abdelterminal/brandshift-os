/**
 * Every route the suite sweeps for accessibility and horizontal overflow.
 *
 * Listed by hand rather than crawled: a crawl finds what is linked, and the
 * point of these two sweeps is to cover what exists -- including a page nobody
 * currently links to.
 */

/** Reachable without signing in. */
export const PUBLIC_ROUTES = ["/en/login", "/en/signup"] as const;

/** Reachable by any signed-in member. */
export const MEMBER_ROUTES = [
  "/en/today",
  "/en/work",
  "/en/people",
  "/en/calendar",
  "/en/inbox",
  "/en/channels",
  "/en/channels/general",
  "/en/channels/northwind-e-commerce-replatform",
  "/en/settings",
  "/en/profile",
] as const;

/** Additionally reachable by a manager. */
export const MANAGER_ROUTES = ["/en/insights", "/en/work/new"] as const;

/** The widths the definition of done names. */
export const VIEWPORTS = [
  { name: "320", width: 320, height: 640 },
  { name: "375", width: 375, height: 667 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
] as const;
