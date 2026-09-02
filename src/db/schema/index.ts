/**
 * The schema barrel. `drizzle.config.ts` points here, so a table that is not
 * re-exported from this file does not exist as far as migrations are concerned.
 */
export * from "./enums";
export * from "./organizations";
export * from "./people";
export * from "./sessions";
export * from "./projects";
export * from "./tasks";
export * from "./activity";
export * from "./relations";
