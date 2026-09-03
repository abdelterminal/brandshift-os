import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import type { Actor } from "./authz";
import {
  MAX_PRIMARY_DESTINATIONS,
  bottomNavFor,
  overflowFor,
  railFor,
  withChannels,
} from "./navigation";

/**
 * The rail's rules, enforced.
 *
 * "Max 5 primary destinations per role" and "Profile and Settings live only in
 * the avatar menu" are the two structural rules that kept the previous app's
 * sidebar from being scannable. Both are cheap to break by adding one more
 * entry, so both are checked here rather than trusted to review.
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

const OWNER = actor({ role: "owner", permissions: { insights: true, people: true } });
const ADMIN = actor({ role: "admin", permissions: { insights: true, people: true } });
const MANAGER = actor({ role: "manager", permissions: { insights: true } });
const MEMBER = actor({ role: "member" });
const MEMBER_WITH_INSIGHTS = actor({ role: "member", permissions: { insights: true } });

const EVERYONE = [OWNER, ADMIN, MANAGER, MEMBER, MEMBER_WITH_INSIGHTS];

describe("the rail", () => {
  it("never exceeds five destinations, for anyone", () => {
    for (const person of EVERYONE) {
      expect(railFor(person).length).toBeLessThanOrEqual(MAX_PRIMARY_DESTINATIONS);
    }
  });

  it("gives coordinators the admin rail", () => {
    expect(railFor(ADMIN).map((item) => item.id)).toEqual([
      "today",
      "work",
      "people",
      "insights",
      "inbox",
    ]);
    expect(railFor(MANAGER).map((item) => item.id)).toEqual(railFor(ADMIN).map((i) => i.id));
  });

  it("gives members their own rail", () => {
    expect(railFor(MEMBER).map((item) => item.id)).toEqual([
      "today",
      "myWork",
      "calendar",
      "inbox",
      "team",
    ]);
  });

  it("hides Insights from anyone without the module flag", () => {
    const withoutFlag = actor({ role: "admin", permissions: {} });
    expect(railFor(withoutFlag).map((item) => item.id)).not.toContain("insights");
    expect(railFor(ADMIN).map((item) => item.id)).toContain("insights");
  });

  it("never puts Profile or Settings in the rail", () => {
    // They live in the avatar menu and nowhere else. Two homes for the same
    // destination is how people stop knowing which one they are on.
    for (const person of EVERYONE) {
      const hrefs = railFor(person).map((item) => item.href);
      expect(hrefs).not.toContain("/profile");
      expect(hrefs).not.toContain("/settings");
    }
  });

  it("has a translation for every destination it can show", () => {
    const nav = en.Nav as Record<string, string>;
    for (const person of EVERYONE) {
      for (const destination of railFor(person)) {
        expect(nav[destination.id], `Nav.${destination.id} is missing`).toBeTruthy();
      }
    }
  });

  it("marks Work as expandable, for the channels Phase 2 nests under it", () => {
    const work = railFor(ADMIN).find((item) => item.id === "work");
    expect(work?.expandable).toBe(true);
  });
});

describe("the mobile bottom nav", () => {
  it("shows four destinations, leaving room for More", () => {
    for (const person of EVERYONE) {
      expect(bottomNavFor(person).length).toBeLessThanOrEqual(4);
    }
  });

  it("gives a member the bar the brief asked for", () => {
    expect(bottomNavFor(MEMBER).map((item) => item.id)).toEqual([
      "today",
      "myWork",
      "calendar",
      "inbox",
    ]);
    expect(overflowFor(MEMBER).map((item) => item.id)).toEqual(["team"]);
  });

  it("loses nothing: every rail destination is either in the bar or under More", () => {
    for (const person of EVERYONE) {
      const reachable = [
        ...bottomNavFor(person).map((item) => item.id),
        ...overflowFor(person).map((item) => item.id),
      ].sort();

      expect(reachable).toEqual(
        railFor(person)
          .map((item) => item.id)
          .sort(),
      );
    }
  });

  it("does not repeat a destination in both places", () => {
    for (const person of EVERYONE) {
      const inBar = new Set(bottomNavFor(person).map((item) => item.id));
      for (const item of overflowFor(person)) {
        expect(inBar.has(item.id)).toBe(false);
      }
    }
  });

  it("always keeps Today first", () => {
    for (const person of EVERYONE) {
      expect(bottomNavFor(person)[0]?.id).toBe("today");
    }
  });
});

describe("channels under Work", () => {
  const CHANNELS = [
    { id: "c1", slug: "meridian-rebrand", name: "Meridian rebrand" },
    { id: "c2", slug: "general", name: "General" },
  ];

  const railWith = (person: Actor) => withChannels(railFor(person), CHANNELS, "All channels");

  it("still never exceeds five primary destinations", () => {
    // The cap counts destinations, not rows. Nesting is what lets channels
    // exist on the rail at all without pushing it past what anyone can scan.
    for (const person of EVERYONE) {
      expect(railWith(person).length).toBeLessThanOrEqual(MAX_PRIMARY_DESTINATIONS);
    }
  });

  it("hangs them under Work, and nowhere else", () => {
    for (const person of EVERYONE) {
      const withChildren = railWith(person).filter((item) => item.children?.length);
      expect(withChildren).toHaveLength(1);
      expect(withChildren[0]!.href).toBe("/work");
    }
  });

  it("names each channel from its own data, not from the catalogue", () => {
    const work = railWith(MEMBER).find((item) => item.children)!;
    expect(work.children!.map((child) => child.label)).toEqual([
      "Meridian rebrand",
      "General",
      "All channels",
    ]);
  });

  it("always ends with the way to the full list", () => {
    // A rail showing only the channels you are already in offers no route to
    // the others, which is how a channel nobody joined stays invisible.
    for (const person of EVERYONE) {
      const work = railWith(person).find((item) => item.children)!;
      expect(work.children!.at(-1)!.href).toBe("/channels");
    }
  });

  it("leaves a rail with no channels unchanged in shape", () => {
    const bare = withChannels(railFor(MEMBER), [], "All channels");
    const work = bare.find((item) => item.children)!;
    expect(work.children).toHaveLength(1);
    expect(work.children![0]!.href).toBe("/channels");
  });
});
