import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { localeEnum } from "./enums";

/**
 * The tenant root. Every other tenant-owned table carries `organizationId` and
 * is reachable only through `withOrg()` -- see `src/db/tenancy.ts`.
 *
 * Table files declare tables only; relations live in `./relations` so the
 * schema modules never form an import cycle.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** URL-safe identifier, used by the org switcher and future subdomains. */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    /** Fallback locale for members who have not chosen one. */
    defaultLocale: localeEnum("default_locale").notNull().default("en"),
    /** IANA zone, e.g. `Europe/Paris`. Drives "due today" and "overdue". */
    timezone: text("timezone").notNull().default("Europe/Paris"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete. A tenant is never hard-deleted. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("organizations_name_idx").on(t.name)],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
