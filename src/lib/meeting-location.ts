/**
 * Where a meeting is.
 *
 * One field, because to the person attending it is one thing: a room is a
 * place and a video link is a place. But a link should be clickable and a room
 * should not, so this is where the two are told apart.
 *
 * Only `http` and `https` become links. A location is typed by a person, and
 * `javascript:` in a field that later becomes an `href` is the oldest trick
 * there is -- so the scheme is checked against a list of two rather than
 * against a list of the ones we happen to have thought of.
 */

export type MeetingLocation =
  { kind: "link"; href: string; host: string } | { kind: "text"; text: string };

export function readLocation(location: string | null): MeetingLocation | null {
  const trimmed = location?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { kind: "text", text: trimmed };
    }
    return { kind: "link", href: url.toString(), host: url.host };
  } catch {
    // Not a URL, which is the common case: "Studio room 2".
    return { kind: "text", text: trimmed };
  }
}

/**
 * The short form, for a list row.
 *
 * A full meeting URL is forty characters of noise in an agenda; the host says
 * which tool it is, which is all the row has to convey.
 */
export function shortLocation(location: string | null): string | null {
  const read = readLocation(location);
  if (!read) return null;
  return read.kind === "link" ? read.host : read.text;
}
