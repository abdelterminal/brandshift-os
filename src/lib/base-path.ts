/**
 * The sub-path this build is mounted under, or `""` when the app owns the
 * whole origin -- which is what local dev, the e2e suite and a LAN
 * deployment all expect.
 *
 * `next.config.ts`'s own `basePath` already prefixes everything the
 * framework builds for you: `next/link`, `next/image`, and next-intl's
 * wrappers over both. This exists for the handful of places that build a
 * path by hand instead, because they were never going to be a navigation --
 * an `EventSource` URL, a plain `<a download>` for a file, a link inside an
 * emailed message, a server rendering its own print route to a PDF. None of
 * those go through the router, so none of them are prefixed automatically.
 *
 * Reads `NEXT_PUBLIC_BASE_PATH` rather than a private name so the same value
 * is available in the browser, where an `EventSource` call is made. Next
 * inlines `NEXT_PUBLIC_*` reads at build time -- in server code as much as
 * client code -- so this is already the literal value by the time anything
 * imports it, not a runtime lookup.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix an absolute path (`/api/x`) with the base path, if there is one. */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
