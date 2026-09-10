import { createHash } from "node:crypto";

/**
 * A fixed namespace, so the same Notion page always becomes the same row.
 *
 * This is what makes the import re-runnable. Ids from a counter or from
 * `randomUUID()` would mean a second run duplicated all twelve procedures, so
 * the only safe rehearsal would be one you never repeat. Derived ids let the
 * run be repeated until the report is clean: every row lands on the id it
 * landed on last time and is updated rather than inserted again.
 *
 * A different namespace from the Mongo migration's on purpose -- the two
 * importers are separate sources and share no ids -- but the same RFC 4122 v5
 * construction, written out rather than pulled from a dependency because it is
 * fifteen lines. SHA-1 is used because the standard specifies it; it is not a
 * security boundary here, only a way to spell a Notion id as a UUID.
 */
const NAMESPACE = "9b1e5d3a-2c4f-4e8a-b7d6-1f0a3c5e7b92";

export function deterministicId(kind: string, sourceId: string): string {
  const namespaceBytes = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const name = Buffer.from(`${kind}:${sourceId}`, "utf8");

  const hash = createHash("sha1").update(namespaceBytes).update(name).digest();

  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
