import { describe, expect, it } from "vitest";

import { TENANT_TABLE_NAMES } from "@/db/tenancy";

import { LIVE_TOPICS, TABLE_TOPIC, topicForTable } from "./live-topics";

/**
 * Every tenant write announces itself on the live bus. This holds the topic
 * map in step with the tenant-table registry, so a table added to one and not
 * the other is caught at build time rather than by a screen that quietly stops
 * updating.
 */
describe("live topic map", () => {
  it("names a topic for every tenant table", () => {
    const missing = TENANT_TABLE_NAMES.filter((name) => !(name in TABLE_TOPIC));
    expect(missing, `no live topic for: ${missing.join(", ")}`).toEqual([]);
  });

  it("maps only real tenant tables", () => {
    const known = new Set<string>(TENANT_TABLE_NAMES);
    const strangers = Object.keys(TABLE_TOPIC).filter((name) => !known.has(name));
    expect(strangers, `TABLE_TOPIC lists non-tenant tables: ${strangers.join(", ")}`).toEqual([]);
  });

  it("only ever yields a declared topic", () => {
    for (const topic of Object.values(TABLE_TOPIC)) {
      expect(LIVE_TOPICS).toContain(topic);
    }
    expect(LIVE_TOPICS).toContain(topicForTable("a_table_that_does_not_exist"));
  });
});
