/**
 * URL-safe names.
 *
 * A channel is reached at `/channels/<slug>`, which means the slug is a thing
 * people read, paste and type. It lives here rather than beside the channel
 * queries because it touches no database and no session -- and because a pure
 * function in a `server-only` module is a pure function nothing can test.
 */

/** `Meridian rebrand` -> `meridian-rebrand`, and never empty. */
export function slugify(input: string, fallback: string): string {
  const slug = input
    // Split an accented letter into a plain one plus a combining mark, then
    // drop the mark. Both steps are needed: without the second, the mark is
    // not `[a-z0-9]` and becomes a separator, so `Inès` slugs as `ine-s`.
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    // Long enough to stay readable, short enough to stay a URL.
    .slice(0, 48)
    .replace(/-+$/g, "");

  return slug || fallback.toLowerCase();
}
