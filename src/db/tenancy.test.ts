import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { Table, getTableColumns, getTableName, is, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "./schema";
import { tasks } from "./schema";
import {
  ORG_COLUMN_EXCEPTIONS,
  TENANT_TABLES,
  TENANT_TABLE_NAMES,
  withOrg,
} from "./tenancy";

/**
 * Postgres row-level security is not in play here (auth is custom -- see
 * DECISIONS.md), so tenancy is enforced in application code. That is only safe
 * while it is enforced in exactly one place, which is what these tests hold to.
 */

const SRC = join(process.cwd(), "src");
const ORG_ID = "3f6b1d24-9c0a-4f18-b2b7-5e1c8a90d431";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("tenant table registry", () => {
  it("accounts for every table that carries organization_id", () => {
    const accountedFor = new Set([
      ...TENANT_TABLE_NAMES,
      ...Object.keys(ORG_COLUMN_EXCEPTIONS),
    ]);

    // The barrel exports enums and relations alongside tables, so widen first
    // and let `is()` do the narrowing.
    const found = (Object.values(schema) as unknown[])
      .filter((value): value is Table => is(value, Table))
      .filter((table) => "organizationId" in getTableColumns(table))
      .map((table) => getTableName(table));

    // A new tenant-owned table that nobody registered would otherwise be
    // queryable without a scope, which is the exact failure this prevents.
    // Registering it means either scoping it or writing down why it is exempt.
    expect([...found].sort()).toEqual([...accountedFor].sort());
  });

  it("gives a reason for each exemption", () => {
    for (const [table, reason] of Object.entries(ORG_COLUMN_EXCEPTIONS)) {
      expect(reason.length, `${table} needs a real explanation`).toBeGreaterThan(60);
    }
  });

  it("does not list tables that are not tenant-owned", () => {
    for (const table of Object.values(TENANT_TABLES)) {
      expect(getTableColumns(table)).toHaveProperty("organizationId");
    }
  });
});

describe("no unscoped access to tenant tables", () => {
  /**
   * `src/db` is the implementation of tenancy and the seed that bootstraps a
   * tenant, so it is the one place allowed to name these tables directly.
   * Everywhere else goes through `withOrg()`.
   */
  const ALLOWED_PREFIX = join("src", "db") + sep;

  const tableIdentifiers = Object.keys(TENANT_TABLES);
  // `db.select().from(tasks)`, `db.insert(tasks)`, `.update(projects)`, ...
  const pattern = new RegExp(
    String.raw`\.(?:from|insert|update|delete)\(\s*(${tableIdentifiers.join("|")})\s*[,)]`,
    "g",
  );

  it("finds none outside src/db", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const relativePath = relative(process.cwd(), file);
      if (relativePath.startsWith(ALLOWED_PREFIX)) continue;

      const contents = readFileSync(file, "utf8");
      for (const match of contents.matchAll(pattern)) {
        const line = contents.slice(0, match.index).split("\n").length;
        offenders.push(`${relativePath}:${line} -> ${match[0].trim()}`);
      }
    }

    expect(
      offenders,
      `Tenant tables must be reached through withOrg() from src/db/tenancy.ts:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("withOrg", () => {
  it("refuses an organization id that is not a uuid", () => {
    expect(() => withOrg("")).toThrow(/verified session/);
    expect(() => withOrg("1 OR 1=1")).toThrow(/verified session/);
    expect(() => withOrg("../../etc/passwd")).toThrow(/verified session/);
  });

  it("filters every read on organization_id", () => {
    const query = withOrg(ORG_ID).select(tasks) as unknown as {
      toSQL: () => { sql: string; params: unknown[] };
    };
    const { sql, params } = query.toSQL();

    expect(sql).toContain('"organization_id" =');
    expect(params).toContain(ORG_ID);
  });

  it("keeps the organization filter when the caller adds conditions", () => {
    const query = withOrg(ORG_ID).select(tasks, isNotNull(tasks.dueDate)) as unknown as {
      toSQL: () => { sql: string; params: unknown[] };
    };

    const { sql, params } = query.toSQL();
    expect(sql).toContain('"organization_id" =');
    expect(sql).toContain("and");
    expect(params).toContain(ORG_ID);
  });

  it("stamps organization_id onto inserts", () => {
    const query = withOrg(ORG_ID).insert(tasks, { title: "Write the tenancy test" });
    const { params } = query.toSQL();

    expect(params).toContain(ORG_ID);
  });

  it("scopes updates and deletes", () => {
    const update = withOrg(ORG_ID).update(tasks, { title: "Renamed" }).toSQL();
    expect(update.sql).toContain('"organization_id" =');
    expect(update.params).toContain(ORG_ID);

    const remove = withOrg(ORG_ID).delete(tasks).toSQL();
    expect(remove.sql).toContain('"organization_id" =');
    expect(remove.params).toContain(ORG_ID);
  });
});
