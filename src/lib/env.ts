import "server-only";

import { z } from "zod";

/**
 * Server environment, validated once at first import. Zod at every input
 * boundary includes this one: a missing `JWT_SECRET` should fail at boot with a
 * readable message, not at 2am inside a token verification.
 */
const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters of randomness"),
  /** A duration string: `30m`, `12h`, `7d`, `30d`. */
  SESSION_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, "SESSION_TTL must look like 30m, 12h or 7d")
    .default("7d"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment. Copy .env.example to .env and fill it in.\n${details}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Seconds represented by a `SESSION_TTL`-shaped duration string. */
export function durationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Not a duration: ${duration}`);
  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  return value * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}
