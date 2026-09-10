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

/**
 * Client services, and the only signed-in fixture holding the `crm` module.
 *
 * A third role rather than granting Elena the flag: she runs engineering, and
 * a fixture whose permissions do not match the job it is named after stops
 * being evidence of anything. It also gives the suite somebody who can see the
 * pipeline and somebody who cannot.
 */
export const SALES = {
  email: "sofia.laurent@brandshift.test",
  name: "Sofia Laurent",
  /** Manager with `crm`: the pipeline is hers, Insights is not the point. */
  role: "manager",
} as const;

/**
 * Operations, and the only signed-in fixture holding the `finance` module.
 *
 * A fifth role for the same reason there is a fourth: a fixture whose
 * permissions do not match the job it is named after stops being evidence of
 * anything, and the suite needs somebody who can see the money and somebody
 * who cannot.
 */
export const FINANCE = {
  email: "tom.decker@brandshift.test",
  name: "Tom Decker",
  /** Admin with `finance`: quotes, invoices and expenses are his. */
  role: "admin",
} as const;

export const MEMBER = {
  email: "lukas.weber@brandshift.test",
  name: "Lukas Weber",
  /** Member: gets Now / Next / Later, and no Insights. */
  role: "member",
} as const;

/**
 * A member who is *on* the Lumen campaign and holds one of its deliverables.
 *
 * The suite already has a member who is on nothing that matters (Lukas); it
 * also needs one who is connected to a specific piece of work, to show the
 * state gate lets the people doing the work move it while keeping everyone
 * else out. Marc leads no department and holds no module flag -- his access
 * to "Launch carrousel — 6 slides" is only that he is its assignee and a
 * contributor on LUM.
 */
export const ASSIGNEE = {
  email: "marc.dubois@brandshift.test",
  name: "Marc Dubois",
  role: "member",
} as const;
