import "server-only";

import { and, eq, getTableName, sql, type GetColumnData, type SQL } from "drizzle-orm";
import type { PgColumn, PgInsertValue, PgUpdateSetSource } from "drizzle-orm/pg-core";

import { activityEvents } from "./schema/activity";
import { organizations } from "./schema/organizations";
import { departments, memberships } from "./schema/people";
import { projectMembers, projects } from "./schema/projects";
import { tasks } from "./schema/tasks";
import { db, type Database } from "./client";

/**
 * The one sanctioned path to a tenant-owned table.
 *
 * Auth here is custom, so Postgres row-level security is not in play (see
 * DECISIONS.md). Tenancy is therefore enforced in app code, and the guardrail
 * is that it is enforced in exactly one place. Every read filters on
 * `organization_id`; every write stamps it. Forgetting is not possible, because
 * no caller ever writes the predicate.
 *
 *     const scope = withOrg(session.organizationId);
 *     const open = await scope.select(tasks, ne(tasks.status, "done"));
 *
 * `src/db/tenancy.test.ts` fails the build if a tenant table is touched from
 * anywhere but this file.
 */

/**
 * Every table carrying `organization_id`. Adding a tenant-owned table without
 * listing it here is caught by the tenancy test.
 */
export const TENANT_TABLES = {
  departments,
  memberships,
  projects,
  projectMembers,
  tasks,
  activityEvents,
} as const;

export type TenantTable = (typeof TENANT_TABLES)[keyof typeof TENANT_TABLES];

/** Table names as they exist in Postgres, for the guard test and diagnostics. */
export const TENANT_TABLE_NAMES: readonly string[] = Object.values(TENANT_TABLES).map(
  (table) => getTableName(table),
);

/**
 * Tables that carry `organization_id` without being tenant-owned, and why.
 *
 * Anything listed here is a deliberate exception that has been thought about.
 * The tenancy test fails on a table that has the column and appears in neither
 * this map nor `TENANT_TABLES`, so the choice is always made on purpose.
 */
export const ORG_COLUMN_EXCEPTIONS: Readonly<Record<string, string>> = {
  sessions:
    "A session belongs to a person, not to a tenant: its organization_id is the org the " +
    "session is currently acting in, and the org switcher changes it. Sessions are looked " +
    "up by token digest before any organization is known, so scoping them by org would " +
    "make sign-in impossible. Session queries filter by user id or token digest instead.",
};

/**
 * The one read of a tenant table that cannot be scoped, because it is what
 * establishes the scope: before you know which organizations someone belongs
 * to, there is no organization id to filter by.
 *
 * It is filtered by `userId` instead, which is just as narrow -- it returns
 * one person's memberships and nothing else -- and it lives here rather than
 * in a feature module so the exception stays in the file that owns tenancy.
 * Everything downstream of it goes through `withOrg()`.
 */
export async function findMembershipsForUser(userId: string, executor: Database = db) {
  if (!UUID_RE.test(userId)) {
    throw new Error("findMembershipsForUser() needs a verified user id.");
  }

  return executor
    .select({
      membershipId: memberships.id,
      organizationId: memberships.organizationId,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      role: memberships.role,
      permissions: memberships.permissions,
      departmentId: memberships.departmentId,
      jobTitle: memberships.jobTitle,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
    .orderBy(organizations.name);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A scope is only ever built from a verified session, but an unvalidated string
 * reaching this far would silently widen every query below it -- so it is
 * checked rather than trusted.
 */
function assertOrganizationId(organizationId: string): string {
  if (!UUID_RE.test(organizationId)) {
    throw new Error("withOrg() needs the organization id from a verified session.");
  }
  return organizationId;
}

export type OrgScope = ReturnType<typeof withOrg>;

/**
 * Bind an executor to one organization.
 *
 * Pass a transaction as `executor` to keep a multi-statement Server Action
 * inside the same scope: `db.transaction((tx) => withOrg(orgId, tx). ...)`.
 */
export function withOrg(organizationId: string, executor: Database = db) {
  const orgId = assertOrganizationId(organizationId);

  /** `organization_id = $orgId AND (...extra)`, the predicate every query gets. */
  function scoped<T extends TenantTable>(table: T, ...extra: Array<SQL | undefined>): SQL {
    return and(eq(table.organizationId, orgId), ...extra) as SQL;
  }

  return {
    organizationId: orgId,
    scoped,

    /** Full-row read. */
    select<T extends TenantTable>(table: T, ...where: Array<SQL | undefined>) {
      return executor
        .select()
        .from(table as TenantTable)
        .where(scoped(table, ...where)) as unknown as Promise<Array<T["$inferSelect"]>>;
    },

    /**
     * Read chosen columns. Lists are server-paginated, so most screens want
     * this rather than dragging every column across the wire.
     *
     * The return type is spelled out so callers keep full inference on the
     * columns they asked for. Casting the field map to `never` -- the obvious
     * way to satisfy drizzle's overloads -- compiles but hands every caller
     * `never[]`, which then fails at the first property access.
     */
    selectFields<T extends TenantTable, F extends Record<string, PgColumn>>(
      table: T,
      fields: F,
      ...where: Array<SQL | undefined>
    ): Promise<Array<{ [K in keyof F]: GetColumnData<F[K]> }>> {
      return executor
        .select(fields)
        .from(table as TenantTable)
        .where(scoped(table, ...where)) as unknown as Promise<
        Array<{ [K in keyof F]: GetColumnData<F[K]> }>
      >;
    },

    /** Row count matching the scope, for pagination footers. */
    async count<T extends TenantTable>(
      table: T,
      ...where: Array<SQL | undefined>
    ): Promise<number> {
      const [row] = await executor
        .select({ value: sql<number>`count(*)::int` })
        .from(table as TenantTable)
        .where(scoped(table, ...where));
      return row?.value ?? 0;
    },

    /**
     * Insert with `organization_id` stamped on. The caller cannot supply it,
     * so a row can never be written into the wrong tenant.
     */
    insert<T extends TenantTable>(
      table: T,
      values:
        | Omit<PgInsertValue<T>, "organizationId">
        | Array<Omit<PgInsertValue<T>, "organizationId">>,
    ) {
      const rows = (Array.isArray(values) ? values : [values]).map((row) => ({
        ...row,
        organizationId: orgId,
      })) as PgInsertValue<T>[];

      return executor.insert(table).values(rows).returning();
    },

    /** Update, always filtered by tenant. `organizationId` is not settable. */
    update<T extends TenantTable>(
      table: T,
      set: Omit<PgUpdateSetSource<T>, "organizationId">,
      ...where: Array<SQL | undefined>
    ) {
      return executor
        .update(table)
        .set(set as PgUpdateSetSource<T>)
        .where(scoped(table, ...where))
        .returning();
    },

    /** Delete, always filtered by tenant. Most domains soft-delete instead. */
    delete<T extends TenantTable>(table: T, ...where: Array<SQL | undefined>) {
      return executor
        .delete(table)
        .where(scoped(table, ...where))
        .returning();
    },
  };
}
