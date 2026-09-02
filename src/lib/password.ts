import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing on Node's built-in scrypt.
 *
 * Deliberately not bcrypt or argon2: both are native modules, and this app is
 * built on Windows and shipped in an Alpine container, so a prebuilt binary
 * that exists on one and not the other is a recurring build failure for no
 * security gain. scrypt is memory-hard, in core, and needs no toolchain.
 *
 * Encoded as `scrypt$N$salt$key` with salt and key in base64url, so the cost
 * travels with the hash and existing rows stay verifiable after it is raised.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const COST = 16_384; // N, must be a power of two
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p

function options(cost: number): ScryptOptions {
  return {
    N: cost,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    // Node's 32MB default is below what N=16384, r=8 needs (128 * N * r).
    maxmem: 256 * cost * BLOCK_SIZE,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options(COST));
  return ["scrypt", COST, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, costPart, saltPart, keyPart] = stored.split("$");
  if (scheme !== "scrypt" || !costPart || !saltPart || !keyPart) return false;

  const cost = Number(costPart);
  if (!Number.isInteger(cost) || cost < 2 || (cost & (cost - 1)) !== 0) return false;

  const expected = Buffer.from(keyPart, "base64url");
  const actual = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(saltPart, "base64url"),
    expected.length,
    options(cost),
  );

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** True when a stored hash was made with a weaker cost and should be upgraded on next login. */
export function needsRehash(stored: string): boolean {
  const [scheme, costPart] = stored.split("$");
  return scheme !== "scrypt" || Number(costPart) < COST;
}
