import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { companyStatusEnum, dealStageEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./people";

/**
 * CRM.
 *
 * Three tables, and the relationships between them are the whole model: a
 * company has contacts and deals, a deal belongs to one company and names one
 * of its contacts as the person you actually talk to.
 *
 * There is no separate CRM activity log. Every screen in this app already
 * writes to `activity_events`, and a deal gets a channel on that same spine
 * exactly as a project does -- `channel_kind` has named `deal` since channels
 * shipped, waiting for this. A second timeline for "calls and emails" would be
 * a second place to look for what happened.
 */

/**
 * A client, or somebody who might become one.
 *
 * `status` is stored rather than derived from whether a deal has been won.
 * Deriving it sounds cleaner and is wrong in both directions: a company you
 * have worked with for years may have no open deal, and one with a won deal
 * from 2019 is not a current client. Somebody has to be able to say which.
 */
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** URL-safe, so `/crm/companies/meridian-bank` is a link somebody can read. */
    slug: text("slug").notNull(),
    website: text("website"),
    industry: text("industry"),
    status: companyStatusEnum("status").notNull().default("prospect"),
    /** Who owns the relationship. Not who created the row. */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("companies_org_slug_key").on(t.organizationId, t.slug),
    index("companies_org_status_idx").on(t.organizationId, t.status),
    index("companies_org_name_idx").on(t.organizationId, t.name),
  ],
);

/**
 * A person at a company.
 *
 * Deliberately not a `users` row. A contact is somebody you talk to, not
 * somebody who signs in: they have no password, no membership and no session,
 * and conflating the two is how a CRM ends up able to email its own staff by
 * accident.
 *
 * `companyId` is nullable because a contact you met at a conference does not
 * always come with a company attached, and refusing to store them until it
 * does is how they end up in somebody's phone instead.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("contacts_org_company_idx").on(t.organizationId, t.companyId),
    index("contacts_org_name_idx").on(t.organizationId, t.name),
    index("contacts_org_email_idx").on(t.organizationId, t.email),
  ],
);

/**
 * A piece of work being sold.
 *
 * `value` is stored as an exact decimal, never a float. Money in a float is a
 * rounding error waiting for a total, and this column is the one ERP will
 * later invoice against.
 *
 * `wonAt` and `lostAt` are separate timestamps rather than one `closedAt` plus
 * the stage, because "how long did we take to win it" and "how long did we
 * take to lose it" are different questions and both get asked.
 */
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** The person you actually talk to about this one. */
    primaryContactId: uuid("primary_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    stage: dealStageEnum("stage").notNull().default("lead"),
    value: numeric("value", { precision: 12, scale: 2 }),
    expectedCloseDate: date("expected_close_date"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Where it came from: a referral, an inbound enquiry, a pitch. */
    source: text("source"),
    notes: text("notes"),
    wonAt: timestamp("won_at", { withTimezone: true }),
    lostAt: timestamp("lost_at", { withTimezone: true }),
    /** Why it was lost. A pipeline with no reasons teaches nobody anything. */
    lostReason: text("lost_reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The pipeline read: one organization, grouped by stage.
    index("deals_org_stage_idx").on(t.organizationId, t.stage),
    index("deals_company_idx").on(t.companyId),
    index("deals_owner_idx").on(t.ownerUserId),
    index("deals_org_close_idx").on(t.organizationId, t.expectedCloseDate),
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type DealStage = (typeof dealStageEnum.enumValues)[number];
export type CompanyStatus = (typeof companyStatusEnum.enumValues)[number];
