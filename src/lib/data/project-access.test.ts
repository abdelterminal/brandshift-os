import { describe, expect, it } from "vitest";

import { decideWorkAccess } from "./project-access";

/**
 * The membership lookup in `mayWorkOn` needs a database; the decision it feeds
 * does not. This covers the branches.
 */
describe("decideWorkAccess", () => {
  const base = { isManager: false, isAssignee: false, memberRole: null, personal: false } as const;

  it("lets a manager change anything", () => {
    expect(decideWorkAccess({ ...base, isManager: true })).toBe(true);
    expect(decideWorkAccess({ ...base, isManager: true, personal: true })).toBe(true);
  });

  it("lets the assignee change their own", () => {
    expect(decideWorkAccess({ ...base, isAssignee: true })).toBe(true);
    expect(decideWorkAccess({ ...base, isAssignee: true, personal: true })).toBe(true);
  });

  it("lets a project lead or contributor change a task on that project", () => {
    expect(decideWorkAccess({ ...base, memberRole: "lead" })).toBe(true);
    expect(decideWorkAccess({ ...base, memberRole: "contributor" })).toBe(true);
  });

  it("refuses a viewer, a non-member, and someone else's personal task", () => {
    expect(decideWorkAccess({ ...base, memberRole: "viewer" })).toBe(false);
    expect(decideWorkAccess({ ...base, memberRole: null })).toBe(false);
    expect(decideWorkAccess({ ...base, personal: true })).toBe(false);
  });
});
