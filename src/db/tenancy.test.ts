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

  const tables = Object.keys(TENANT_TABLES).join("|");

  /**
   * Two patterns, because one was not precise enough.
   *
   * `.from(tasks)` only ever appears in a raw select chain -- the scoped
   * helpers take the table as an argument and build the `from` themselves --
   * so any occurrence outside `src/db` is a violation.
   *
   * For insert/update/delete the receiver has to be checked. `db.insert(x)`
   * and `tx.insert(x)` are violations, but `withOrg(id).insert(x)` and
   * `withOrg(id, tx).insert(x)` are the sanctioned path. Matching the bare
   * method name flagged the correct call alongside the wrong one, which is the
   * kind of false positive that gets a guard deleted rather than fixed.
   */
  const patterns = [
    new RegExp(String.raw`\.from\(\s*(?:${tables})\s*[,)]`, "g"),
    new RegExp(
      String.raw`\b(?:db|tx|executor)\s*\.\s*(?:insert|update|delete)\(\s*(?:${tables})\s*[,)]`,
      "g",
    ),
  ];

  it("finds none outside src/db", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const relativePath = relative(process.cwd(), file);
      if (relativePath.startsWith(ALLOWED_PREFIX)) continue;

      const contents = readFileSync(file, "utf8");
      for (const pattern of patterns) {
        for (const match of contents.matchAll(pattern)) {
          const line = contents.slice(0, match.index).split("\n").length;
          offenders.push(`${relativePath}:${line} -> ${match[0].trim()}`);
        }
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

  it("returns writes as a thenable that still exposes toSQL", () => {
    // Every write is wrapped so that awaiting it also announces the change on
    // the live bus. The wrapper must stay lazy (this test never awaits, so
    // nothing runs and nothing is announced) and must keep `.toSQL()`.
    const write = withOrg(ORG_ID).insert(tasks, { title: "x" });
    expect(typeof write.then).toBe("function");
    expect(typeof write.toSQL).toBe("function");
    expect(write.toSQL().sql).toContain("insert into");
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
