import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import type { Actor } from "./authz";
import {
  MAX_PRIMARY_DESTINATIONS,
  bottomNavFor,
  destinationsFor,
  overflowFor,
  railFor,
  withChannels,
  withDepartments,
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
    expect(work?.expandableChildren).toBe("channels");
  });

  it("marks People (or Team) as expandable, for the departments it nests", () => {
    for (const person of EVERYONE) {
      const rail = railFor(person);
      const peopleLike = rail.find((item) => item.href === "/people");
      expect(peopleLike?.expandableChildren, `for ${person.role}`).toBe("departments");
    }
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

describe("departments under People", () => {
  const DEPARTMENTS = [
    { id: "d1", name: "Design" },
    { id: "d2", name: "Engineering" },
  ];

  const railWith = (person: Actor) => withDepartments(railFor(person), DEPARTMENTS);

  it("still never exceeds five primary destinations", () => {
    for (const person of EVERYONE) {
      expect(railWith(person).length).toBeLessThanOrEqual(MAX_PRIMARY_DESTINATIONS);
    }
  });

  it("hangs them under People (or Team), and nowhere else", () => {
    for (const person of EVERYONE) {
      const withChildren = railWith(person).filter((item) => item.children?.length);
      expect(withChildren).toHaveLength(1);
      expect(withChildren[0]!.href).toBe("/people");
    }
  });

  it("names each department from its own data, not from the catalogue", () => {
    const people = railWith(MEMBER).find((item) => item.children)!;
    expect(people.children!.map((child) => child.label)).toEqual(["Design", "Engineering"]);
  });

  it("carries the department as a query param on the one page that reads it", () => {
    const people = railWith(MEMBER).find((item) => item.children)!;
    for (const child of people.children!) {
      expect(child.href).toMatch(/^\/people\?department=/);
    }
  });

  it("does not add a trailing link the way channels do", () => {
    // The parent row already goes to the unfiltered /people; there is
    // nothing here that needs a route of its own to reach.
    const people = railWith(MEMBER).find((item) => item.children)!;
    expect(people.children).toHaveLength(DEPARTMENTS.length);
  });

  it("leaves a rail with no departments yet showing none, not a broken row", () => {
    // Every fresh /signup starts here. Sidebar already treats an empty
    // children array the same as none at all, so nothing should render --
    // and importantly, nothing should throw either.
    const bare = withDepartments(railFor(MEMBER), []);
    const people = bare.find((item) => item.href === "/people")!;
    expect(people.children).toHaveLength(0);
  });

  it("does not disturb Work's own channel-shaped children", () => {
    // Both Work and People can be expandable on the same rail; withDepartments
    // must only ever touch the one whose expandableChildren is "departments".
    const withChannelsFirst = withChannels(railFor(ADMIN), [], "All channels");
    const both = withDepartments(withChannelsFirst, DEPARTMENTS);

    const work = both.find((item) => item.id === "work")!;
    expect(work.children).toHaveLength(1); // just "All channels"

    const people = both.find((item) => item.id === "people")!;
    expect(people.children).toHaveLength(2);
  });
});

describe("the client-services rail", () => {
  const SALES = actor({ role: "manager", permissions: { crm: true, insights: true } });
  const JUNIOR_SALES = actor({ role: "member", permissions: { crm: true } });

  it("still fits inside the cap", () => {
    for (const person of [SALES, JUNIOR_SALES]) {
      expect(railFor(person).length).toBeLessThanOrEqual(MAX_PRIMARY_DESTINATIONS);
    }
  });

  it("gives the pipeline to whoever holds the module, whatever their role", () => {
    // The module says this person's day is the pipeline; seniority does not.
    for (const person of [SALES, JUNIOR_SALES]) {
      expect(railFor(person).map((item) => item.href)).toContain("/crm");
    }
  });

  it("does not give it to anybody else", () => {
    for (const person of [OWNER, ADMIN, MANAGER, MEMBER, MEMBER_WITH_INSIGHTS]) {
      expect(railFor(person).map((item) => item.href)).not.toContain("/crm");
    }
  });

  it("spends the slot Insights had, rather than adding a sixth", () => {
    // Sofia holds `insights` too. Something has to give for the cap to mean
    // anything, and reporting is a weekly errand where a pipeline is a daily
    // one -- Insights stays reachable from the command palette.
    const hrefs = railFor(SALES).map((item) => item.href);
    expect(hrefs).toContain("/crm");
    expect(hrefs).not.toContain("/insights");
  });

  it("is still reachable by name for them", () => {
    expect(destinationsFor(SALES).map((item) => item.href)).toContain("/insights");
  });
});
