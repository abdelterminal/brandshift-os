import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { localeEnum, membershipStatusEnum, roleEnum } from "./enums";
import { organizations } from "./organizations";

/**
 * Per-module permission flags layered on top of the named role. The role says
 * how much of the org you steer; these say which modules you may touch at all.
 * A flag that is absent reads as `false`.
 *
 * Growth path: Phase 2 adds ERP/CRM modules by adding keys here, which is why
 * this is one jsonb column and not a widening list of boolean columns.
 */
export type ModulePermissions = {
  finance?: boolean;
  people?: boolean;
  crm?: boolean;
  insights?: boolean;
};

export const NO_MODULE_PERMISSIONS: ModulePermissions = {};

/**
 * A person. Identity is global, not tenant-owned: the same human can hold a
 * membership in several organizations. Everything org-specific -- role,
 * department, job title, permissions -- lives on `memberships`.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    /** scrypt, encoded by `src/lib/password.ts`. Never leaves the server. */
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    /** Personal override; falls back to the organization's default locale. */
    locale: localeEnum("locale"),
    /**
     * Sessions issued before this moment are refused, so a password change
     * signs every other device out.
     */
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (t) => [index("users_name_idx").on(t.name)],
);

/** A unit of the org chart. People belong to at most one. */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Set once the lead's membership exists; enforced in app code, not by FK. */
    leadUserId: uuid("lead_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("departments_org_slug_key").on(t.organizationId, t.slug),
    index("departments_org_idx").on(t.organizationId),
  ],
);

/**
 * The join between a person and an organization -- and the only place a role
 * is recorded. `src/lib/authz.ts` reads role + permissions from here.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    role: roleEnum("role").notNull().default("member"),
    permissions: jsonb("permissions")
      .$type<ModulePermissions>()
      .notNull()
      .default(NO_MODULE_PERMISSIONS),
    jobTitle: text("job_title"),
    status: membershipStatusEnum("status").notNull().default("invited"),
    /** True for the person who created the org. Guards "last owner" checks. */
    isFounder: boolean("is_founder").notNull().default(false),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_key").on(t.organizationId, t.userId),
    index("memberships_org_idx").on(t.organizationId),
    index("memberships_org_department_idx").on(t.organizationId, t.departmentId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Role = Membership["role"];
