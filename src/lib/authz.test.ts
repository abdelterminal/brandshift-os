import { describe, expect, it } from "vitest";

import { allowedActions, atLeast, can, hasModule, type Action, type Actor } from "./authz";

/**
 * The permission rules.
 *
 * These are asserted rather than read, because `can()` is the single place UI
 * visibility and Server Action enforcement agree -- a rule that quietly widens
 * here widens both at once, in a way no screen would show you.
 */

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    role: "member",
    permissions: {},
    ...overrides,
  };
}

const OWNER = actor({ role: "owner", permissions: { finance: true, people: true, crm: true, insights: true } });
const ADMIN = actor({ role: "admin", permissions: { people: true, insights: true } });
const MANAGER = actor({ role: "manager", permissions: { insights: true } });
const MEMBER = actor({ role: "member" });

describe("role ranking", () => {
  it("orders member < manager < admin < owner", () => {
    expect(atLeast(MEMBER, "member")).toBe(true);
    expect(atLeast(MEMBER, "manager")).toBe(false);
    expect(atLeast(MANAGER, "manager")).toBe(true);
    expect(atLeast(MANAGER, "admin")).toBe(false);
    expect(atLeast(ADMIN, "admin")).toBe(true);
    expect(atLeast(ADMIN, "owner")).toBe(false);
    expect(atLeast(OWNER, "owner")).toBe(true);
  });

  it("means a higher role covers everything a lower one can do", () => {
    const lower = new Set(allowedActions(MEMBER));
    for (const action of lower) {
      expect(can(MANAGER, action), `manager should keep ${action}`).toBe(true);
    }
  });
});

describe("module flags", () => {
  it("gate Insights, whatever the role", () => {
    // An owner without the flag still does not get reporting: the flag is the
    // gate, and the role only decides how much of what is behind it.
    const ownerWithoutInsights = actor({ role: "owner", permissions: {} });
    expect(can(ownerWithoutInsights, "insights.view")).toBe(false);
    expect(can(MANAGER, "insights.view")).toBe(true);
  });

  it("are false when absent rather than throwing", () => {
    expect(hasModule(MEMBER, "finance")).toBe(false);
    expect(hasModule(OWNER, "finance")).toBe(true);
  });
});

describe("what each role may do", () => {
  it("lets everyone see their own day and work", () => {
    for (const action of ["today.view", "work.view", "inbox.view", "calendar.view"] as Action[]) {
      expect(can(MEMBER, action), action).toBe(true);
    }
  });

  it("lets every member read the directory", () => {
    // The org chart is not secret; the sensitive parts of a person's record
    // are gated separately by the `people` module flag.
    expect(can(MEMBER, "people.view")).toBe(true);
  });

  it("keeps project creation to managers and above", () => {
    expect(can(MEMBER, "project.create")).toBe(false);
    expect(can(MANAGER, "project.create")).toBe(true);
    expect(can(ADMIN, "project.create")).toBe(true);
  });

  it("lets anyone create a task", () => {
    expect(can(MEMBER, "task.create")).toBe(true);
  });

  it("allows inviting by role or by the people flag", () => {
    expect(can(MEMBER, "member.invite")).toBe(false);
    expect(can(ADMIN, "member.invite")).toBe(true);
    expect(can(actor({ role: "manager", permissions: { people: true } }), "member.invite")).toBe(
      true,
    );
  });

  it("keeps role editing and org settings to admins and above", () => {
    for (const action of ["member.editRole", "organization.editSettings"] as Action[]) {
      expect(can(MEMBER, action), action).toBe(false);
      expect(can(MANAGER, action), action).toBe(false);
      expect(can(ADMIN, action), action).toBe(true);
      expect(can(OWNER, action), action).toBe(true);
    }
  });
});

describe("the rule table", () => {
  it("has an answer for every declared action", () => {
    // A missing entry would throw at the call site rather than deny, which in
    // a UI check reads as a crash and in an action check reads as a 500.
    const actions = allowedActions(OWNER);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(() => can(MEMBER, action)).not.toThrow();
    }
  });
});
