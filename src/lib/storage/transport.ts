import "server-only";

import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";

import { env } from "@/lib/env";

/**
 * Where uploaded bytes live.
 *
 * Shaped like `mail/transport.ts` on purpose: one interface, one driver today,
 * and the configuration key that chooses between them. Moving to S3 is then an
 * implementation beside `disk` rather than a change at every call site.
 *
 * It deliberately knows nothing about documents, permissions or tenancy. The
 * caller resolves the row through `withOrg()` and decides whether this person
 * may have it; by the time a key reaches here, that question is settled.
 */

export type StorageDriver = {
  readonly name: string;
  put(key: string, body: Buffer): Promise<void>;
  /** A stream, so a 10 MB download never sits in the server's memory. */
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
};

/**
 * A key is a path this app built from two ids -- see `storageKeyFor`. This
 * re-checks that at the boundary anyway.
 *
 * Not because the callers are untrusted, but because a path join is the one
 * operation where a mistake upstream becomes a read of `/etc/passwd` rather
 * than a 404. The check is on the *resolved* path rather than on the key's
 * text: `a/../../b` contains no suspicious substring and still escapes, so
 * pattern-matching the input is the version of this that looks right and is
 * not.
 */
function resolveWithin(root: string, key: string): string {
  const base = resolve(root);
  const target = resolve(base, key);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error("Refusing a storage key that resolves outside the storage root");
  }
  return target;
}

/**
 * A directory on a volume.
 *
 * The whole of what this deployment needs, and what `DECISIONS.md` always said
 * the easy part was. The hard part it names -- backups -- lives in
 * `backup.ps1`, which archives this directory in the same run as the database
 * dump. Neither half is worth having without the other.
 */
function diskDriver(root: string): StorageDriver {
  return {
    name: "disk",

    async put(key, body) {
      const target = resolveWithin(root, key);
      // The organization's directory on first upload. `recursive` also makes
      // this idempotent, which matters because every upload calls it.
      await mkdir(dirname(target), { recursive: true });
      // `wx` fails rather than overwriting. A key collision means two rows
      // claim one file, and silently replacing the first is how somebody's
      // signed contract becomes somebody else's moodboard.
      await writeFile(target, body, { flag: "wx" });
    },

    async read(key) {
      return createReadStream(resolveWithin(root, key));
    },

    async remove(key) {
      // `force` so removing an attachment whose file is already gone still
      // removes the row. A missing file is untidy; a row pointing at nothing
      // that cannot be deleted is worse.
      await rm(resolveWithin(root, key), { force: true });
    },
  };
}

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (cached) return cached;
  const { STORAGE_DRIVER, STORAGE_ROOT } = env();
  // One member today; the switch is here so adding `s3` is a case rather than
  // a refactor, and so an unknown value fails loudly at the boundary.
  switch (STORAGE_DRIVER) {
    case "disk":
      cached = diskDriver(STORAGE_ROOT);
      return cached;
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${String(STORAGE_DRIVER)}`);
  }
}

/** Test seam: the driver is memoised, and a test that changes env needs it dropped. */
export function resetStorageForTests(): void {
  cached = null;
}
