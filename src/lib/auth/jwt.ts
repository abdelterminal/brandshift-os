import { SignJWT, jwtVerify } from "jose";

/**
 * The cookie half of authentication.
 *
 * An HS256 JWT in an HttpOnly cookie, carrying a random `jti`. The server
 * stores only SHA-256 of that `jti` in `sessions.token_digest`, so a leaked
 * database yields nothing that can be replayed as a cookie.
 *
 * The signature proves the token was issued here; the digest lookup proves the
 * session is still live. Both are required -- a valid signature on a revoked
 * session must not get anyone in, which is the whole reason the sessions table
 * exists instead of trusting the JWT alone.
 *
 * Everything here uses Web Crypto rather than `node:crypto`, and reads the
 * secret from the environment directly rather than through `env()`, so the
 * middleware can verify a token without dragging the database layer or a
 * Node-only API into its bundle.
 */

export const SESSION_COOKIE = "brandshift_session";

const ISSUER = "brandshift-os";
const AUDIENCE = "brandshift-os";

export type SessionClaims = {
  /** User id. */
  sub: string;
  /** Random per-session secret; its digest is what the database holds. */
  jti: string;
};

function key(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is missing or too short. See .env.example.");
  }
  return new TextEncoder().encode(secret);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256, hex. The only form of `jti` that is ever written down. */
export async function digest(jti: string): Promise<string> {
  const hashed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jti));
  return [...new Uint8Array(hashed)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newJti(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Seconds a session lasts. Mirrors `SESSION_TTL`, defaulting to a week. */
export function sessionTtlSeconds(): number {
  const raw = process.env.SESSION_TTL ?? "7d";
  const match = /^(\d+)([smhd])$/.exec(raw);
  if (!match) return 7 * 86400;
  const unit = match[2] as "s" | "m" | "h" | "d";
  return Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setJti(claims.jti)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + sessionTtlSeconds())
    .sign(key());
}

/**
 * Verifies signature, issuer, audience and expiry. It says nothing about
 * whether the session is still live -- only the digest lookup can say that.
 */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });

    if (typeof payload.sub !== "string" || typeof payload.jti !== "string") return null;
    return { sub: payload.sub, jti: payload.jti };
  } catch {
    // Expired, tampered with, or signed by a different secret. All the same
    // answer to the caller: this token does not identify anyone.
    return null;
  }
}
