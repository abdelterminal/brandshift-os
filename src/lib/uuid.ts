/**
 * Is this string shaped like a UUID?
 *
 * Every id in this schema is a `uuid` column, and Postgres does not compare a
 * uuid to arbitrary text -- it raises `invalid input syntax for type uuid` and
 * the request dies as a 500. So `/finance/quotes/not-a-uuid` used to be a
 * server error rather than a missing page, which is a lie about what happened:
 * the request was fine, the thing asked for does not exist.
 *
 * The check lives here rather than in each page because the pages are not the
 * only callers -- a task id arrives in a query string, and Server Actions read
 * rows by id too. Guarding inside the getters covers all three at once, and
 * every one of them already returns `null` for "no such row", which is exactly
 * what a malformed id means.
 *
 * Deliberately shape-only, not version-aware. Version 4 is what `defaultRandom`
 * produces and version 5 is what the Mongo migration produces, and a check that
 * pinned the version would reject half the ids in a migrated database.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
