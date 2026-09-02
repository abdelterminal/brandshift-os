/**
 * The seeded cast the specs sign in as.
 *
 * Mirrors `src/db/seed-data.ts`. Kept here as a small, explicit list rather
 * than imported, because importing the seed module would pull `server-only`
 * and the database driver into the test process for the sake of four strings.
 */
export const SEED_PASSWORD = "brandshift";

export const MANAGER = {
  email: "elena.rossi@brandshift.test",
  name: "Elena Rossi",
  /** Manager: gets the coordination queue and may create projects. */
  role: "manager",
} as const;

export const MEMBER = {
  email: "lukas.weber@brandshift.test",
  name: "Lukas Weber",
  /** Member: gets Now / Next / Later, and no Insights. */
  role: "member",
} as const;
