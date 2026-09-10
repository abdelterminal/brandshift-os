import { describe, expect, it } from "vitest";

import type { Actor } from "@/lib/authz";

import { seesOnlyOwnWork } from "./visibility";

const actor = (role: Actor["role"]): Actor => ({
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  role,
  permissions: {},
});

describe("seesOnlyOwnWork", () => {
  it("is true for a member", () => {
    expect(seesOnlyOwnWork(actor("member"))).toBe(true);
  });

  it("is false for anyone who coordinates the org", () => {
    expect(seesOnlyOwnWork(actor("manager"))).toBe(false);
    expect(seesOnlyOwnWork(actor("admin"))).toBe(false);
    expect(seesOnlyOwnWork(actor("owner"))).toBe(false);
  });
});
