import "server-only";

import { and, eq, getTableName, sql, type GetColumnData, type SQL } from "drizzle-orm";
import type { PgColumn, PgInsertValue, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";

import { activityEvents } from "./schema/activity";
import { channelMembers, channels, messages } from "./schema/channels";
import { notifications } from "./schema/notifications";
import { organizations } from "./schema/organizations";
import { departments, memberships } from "./schema/people";
import { projectMembers, projects } from "./schema/projects";
import { tasks } from "./schema/tasks";
import { db, type Database } from "./client";

/**
 * Anything that can run a query: the pool, or a transaction opened on it.
 * Derived from `Database` so the two cannot drift apart.
 */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

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
  notifications,
  channels,
  channelMembers,
  messages,
} as const;

export type TenantTable = (typeof TENANT_TABLES)[keyof typeof TENANT_TABLES];

/** Table names as they exist in Postgres, for the guard test and diagnostics. */
export const TENANT_TABLE_NAMES: readonly string[] = Object.values(TENANT_TABLES).map((table) =>
  getTableName(table),
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
export async function findMembershipsForUser(userId: string, executor: Executor = db) {
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
export function withOrg(organizationId: string, executor: Executor = db) {
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

    /**
     * A scoped read that needs to join.
     *
     * Lists want the assignee's name beside the task and the department's name
     * beside the project, which `selectFields` cannot express -- it applies its
     * `where` immediately, and drizzle will not let you join after that.
     *
     * Joins are described as data rather than passed as a callback, so this
     * helper stays in control of the order: joins first, then the tenant
     * filter. A caller cannot end up with the join but not the filter.
     *
     *     scope.selectJoined(
     *       tasks,
     *       { id: tasks.id, assignee: users.name },
     *       [{ table: users, on: eq(users.id, tasks.assigneeUserId), type: "left" }],
     *       eq(tasks.status, "blocked"),
     *     )
     *
     * Columns coming from a `left` join are typed non-nullable; treat them as
     * possibly null at the call site.
     */
    selectJoined<T extends TenantTable, F extends Record<string, PgColumn>>(
      table: T,
      fields: F,
      joins: Array<{ table: PgTable; on: SQL; type?: "inner" | "left" }>,
      ...where: Array<SQL | undefined>
    ): Promise<Array<{ [K in keyof F]: GetColumnData<F[K]> }>> {
      type Joinable = {
        innerJoin: (t: PgTable, on: SQL) => Joinable;
        leftJoin: (t: PgTable, on: SQL) => Joinable;
        where: (condition: SQL) => unknown;
      };

      let query = executor.select(fields).from(table as TenantTable) as unknown as Joinable;
      for (const join of joins) {
        query =
          join.type === "left"
            ? query.leftJoin(join.table, join.on)
            : query.innerJoin(join.table, join.on);
      }

      return query.where(scoped(table, ...where)) as Promise<
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
     * Counts grouped by one column, in one query.
     *
     * The unread badge beside every channel in the rail is one number per
     * channel, and the honest way to get it is a `group by` -- not a count per
     * row, and not every message pulled into memory to be tallied there. Joins
     * are data for the same reason they are in `selectJoined`: this helper
     * keeps the tenant filter last, so a caller cannot get the join without it.
     *
     * Keys come back as strings because that is what `group by` on a uuid
     * yields; callers look them up by id, which is already a string.
     */
    async groupCount<T extends TenantTable>(
      table: T,
      by: PgColumn,
      joins: Array<{ table: PgTable; on: SQL; type?: "inner" | "left" }> = [],
      ...where: Array<SQL | undefined>
    ): Promise<Map<string, number>> {
      type Groupable = {
        innerJoin: (t: PgTable, on: SQL) => Groupable;
        leftJoin: (t: PgTable, on: SQL) => Groupable;
        where: (condition: SQL) => { groupBy: (column: PgColumn) => unknown };
      };

      let query = executor
        .select({ key: by, value: sql<number>`count(*)::int` })
        .from(table as TenantTable) as unknown as Groupable;

      for (const join of joins) {
        query =
          join.type === "left"
            ? query.leftJoin(join.table, join.on)
            : query.innerJoin(join.table, join.on);
      }

      const rows = (await query.where(scoped(table, ...where)).groupBy(by)) as Array<{
        key: unknown;
        value: number;
      }>;

      return new Map(
        rows.filter((row) => row.key != null).map((row) => [String(row.key), row.value]),
      );
    },

    /**
     * Insert with `organization_id` stamped on. The caller cannot supply it,
     * so a row can never be written into the wrong tenant.
     */
    insert<T extends TenantTable>(
      table: T,
      // `$inferInsert` rather than `PgInsertValue<T>`: the latter does not
      // resolve per-table when `T` is generic, so every caller was offered a
      // shape with none of its own columns on it.
      values:
        | Omit<T["$inferInsert"], "organizationId">
        | Array<Omit<T["$inferInsert"], "organizationId">>,
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
