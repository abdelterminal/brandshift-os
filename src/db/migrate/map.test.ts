import { describe, expect, it } from "vitest";

import {
  assignRoles,
  departmentDescription,
  deterministicId,
  dayString,
  foldClientName,
  mapEvent,
  mapPriority,
  mapProjectStatus,
  mapRole,
  mapTaskStatus,
  personName,
  pickCompanyName,
  projectKey,
  taskDescription,
} from "./map";

/**
 * The translation, tested against the shapes the real database actually holds.
 *
 * Every case below was taken from profiling `mediast_db`: the client typed two
 * ways, the project status written in title case, the task with no priority,
 * the forty projects whose names collide on their initials. A migration is run
 * once against data nobody can re-create, so the arithmetic of it deserves the
 * same treatment as the arithmetic of an invoice.
 */

describe("deterministicId", () => {
  it("gives the same row the same id every run", () => {
    const first = deterministicId("project", "6a5f8ff1f85949b93554e130");
    const second = deterministicId("project", "6a5f8ff1f85949b93554e130");
    expect(first).toBe(second);
  });

  it("keeps different kinds of thing apart", () => {
    // The same ObjectId can name a project and, in another collection,
    // something else entirely. Two rows must not collide on one id.
    const id = "6a5f8ff1f85949b93554e130";
    expect(deterministicId("project", id)).not.toBe(deterministicId("task", id));
  });

  it("is a valid v5 UUID", () => {
    const id = deterministicId("user", "6a5f9024f85949b93554e131");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("roles", () => {
  const at = (iso: string) => new Date(iso);

  it("makes the earliest admin the owner and leaves everyone else alone", () => {
    const users = [
      {
        email: "later@x.test",
        role: "ADMIN",
        createdAt: at("2026-08-01T00:00:00Z"),
      },
      {
        email: "admin@x.test",
        role: "ADMIN",
        createdAt: at("2026-07-21T12:49:44Z"),
      },
      {
        email: "worker@x.test",
        role: "EMPLOYEE",
        createdAt: at("2026-07-21T15:51:08Z"),
      },
    ];

    const result = assignRoles(users);
    if ("error" in result) throw new Error(result.error);

    expect(result.founder.email).toBe("admin@x.test");
    expect(result.roles.get("admin@x.test")).toBe("owner");
    expect(result.roles.get("later@x.test")).toBe("admin");
    expect(result.roles.get("worker@x.test")).toBe("member");
  });

  it("refuses rather than promoting somebody at random", () => {
    const result = assignRoles([
      {
        email: "worker@x.test",
        role: "EMPLOYEE",
        createdAt: at("2026-07-21T00:00:00Z"),
      },
    ]);
    expect("error" in result).toBe(true);
  });

  it("never invents a manager", () => {
    // The old schema records nothing that would justify the middle tier, and
    // handing somebody permissions nobody granted is the worst thing a
    // migration can do quietly.
    expect(mapRole("EMPLOYEE")).toBe("member");
    expect(mapRole(undefined)).toBe("member");
    expect(mapRole("ADMIN")).toBe("admin");
  });
});

describe("personName", () => {
  it("joins the two halves the old app stored", () => {
    expect(personName("Zayneb", "Ismaili")).toBe("Zayneb Ismaili");
  });

  it("survives the half that is missing", () => {
    // The real admin account has a first name and an empty last name.
    expect(personName("Admin", "")).toBe("Admin");
    expect(personName(undefined, "Ismaili")).toBe("Ismaili");
  });
});

describe("client names", () => {
  it("sees one client typed two ways", () => {
    // Both of these are on real projects in the source database.
    expect(foldClientName("Obarfum ")).toBe(foldClientName("Ô Bar’Fum"));
  });

  it("does not pull genuinely different clients together", () => {
    for (const [a, b] of [
      ["Mr Dyaf", "Germarok"],
      ["Maarjet", "Marjad"],
      ["Study in Asia", "Study in Africa"],
      ["Qderm Officiel", "Qderm"],
    ]) {
      expect(foldClientName(a), `${a} vs ${b}`).not.toBe(foldClientName(b));
    }
  });

  it("keeps the spelling that carries the most detail", () => {
    // The accent and the word breaks cannot be recovered from `Obarfum`, so
    // the longer spelling is the one worth keeping.
    expect(pickCompanyName(["Obarfum ", "Ô Bar’Fum"])).toBe("Ô Bar’Fum");
  });

  it("breaks a tie the same way twice", () => {
    expect(pickCompanyName(["Acme", "Acmé"])).toBe(pickCompanyName(["Acmé", "Acme"]));
  });
});

describe("projectKey", () => {
  it("reads initials the way a person naming it would", () => {
    const taken = new Set<string>();
    expect(projectKey("Mr Dyaf - Filmmaking", taken)).toBe("MDF");
  });

  it("gives a one-word project a key long enough to be legal", () => {
    const taken = new Set<string>();
    const key = projectKey("Tucoso", taken);
    expect(key).toMatch(/^[A-Z]{2,5}$/);
  });

  it("never hands out the same key twice", () => {
    // The real data is forty projects named `Client - Discipline`, which
    // collide constantly: ten of them end in `- Filmmaking`.
    const taken = new Set<string>();
    const names = [
      "Ô Bar’Fum - Filmmaking",
      "Mr Dyaf - Filmmaking",
      "Germarok - Filmmaking",
      "Study in Asia - Filmmaking",
      "Tucoso - Filmmaking",
      "Clinique Tafilalt - Filmmaking",
      "Maarjet - Filmmaking",
      "Mediast Creative - Filmmaking",
      "Skyntherapie - Filmmaking",
      "Ô Bar’Fum - Marketing",
      "Mr Dyaf - Marketing",
      "Obarfum - Content",
    ];

    const keys = names.map((name) => projectKey(name, taken));

    expect(new Set(keys).size).toBe(names.length);
    for (const key of keys) expect(key, key).toMatch(/^[A-Z]{2,5}$/);
  });

  it("holds up when every readable key is gone", () => {
    const taken = new Set<string>();
    const keys = Array.from({ length: 60 }, () => projectKey("Alpha Beta", taken));

    expect(new Set(keys).size).toBe(60);
    for (const key of keys) expect(key, key).toMatch(/^[A-Z]{2,5}$/);
  });

  it("copes with a name that has no letters in it", () => {
    const taken = new Set<string>();
    expect(projectKey("2026 // 01", taken)).toMatch(/^[A-Z]{2,5}$/);
  });
});

describe("statuses", () => {
  it("reads the legacy label as well as the canonical one", () => {
    // One project in the real data is stored as `Pending`, not `PENDING`.
    expect(mapProjectStatus("Pending")).toBe("planning");
    expect(mapProjectStatus("PENDING")).toBe("planning");
  });

  it("maps each project status to the nearest one here", () => {
    expect(mapProjectStatus("IN_PROGRESS")).toBe("active");
    expect(mapProjectStatus("ON_HOLD")).toBe("on_hold");
    expect(mapProjectStatus("COMPLETED")).toBe("completed");
    // The lossy one, and the reason it is counted in the report.
    expect(mapProjectStatus("CANCELLED")).toBe("archived");
  });

  it("treats a task in review as still in flight", () => {
    // Calling it done would take it off the screen of the person who still
    // has to look at it, which is the more expensive mistake.
    expect(mapTaskStatus("REVIEW")).toBe("in_progress");
  });

  it("turns an archived task into a cancelled one, whatever it said before", () => {
    expect(mapTaskStatus("TODO", true)).toBe("cancelled");
    expect(mapTaskStatus("DONE", true)).toBe("cancelled");
  });

  it("falls back rather than throwing on a status nobody has seen", () => {
    expect(mapTaskStatus(undefined)).toBe("todo");
    expect(mapProjectStatus("SOMETHING_NEW")).toBe("planning");
  });

  it("defaults the one task in the real data that has no priority", () => {
    expect(mapPriority(undefined)).toBe("medium");
    expect(mapPriority("URGENT")).toBe("urgent");
    expect(mapPriority("LOW")).toBe("low");
  });
});

describe("mapEvent", () => {
  it("translates the old vocabulary", () => {
    expect(mapEvent("TASK_COMPLETED")).toEqual({
      verb: "task.completed",
      subject: "task",
    });
    expect(mapEvent("PROJECT_CREATED")).toEqual({
      verb: "project.created",
      subject: "project",
    });
  });

  it("refuses an event it does not recognise rather than guessing a verb", () => {
    // A verb the feed cannot render is worse than an event that was skipped
    // and counted.
    expect(mapEvent("SOMETHING_ELSE")).toBeNull();
    expect(mapEvent(undefined)).toBeNull();
  });
});

describe("free text", () => {
  it("keeps what people typed into fields this app has no column for", () => {
    expect(
      taskDescription({
        description: "Shoot the b-roll",
        note: "Ask for the key",
      }),
    ).toBe("Shoot the b-roll\n\nNote: Ask for the key");
  });

  it("labels a refusal rather than burying it", () => {
    expect(
      taskDescription({
        description: null,
        rejectionReason: "Client changed the brief",
      }),
    ).toBe("Refused: Client changed the brief");
  });

  it("is null when there was nothing there", () => {
    expect(taskDescription({ description: "  ", note: null })).toBeNull();
    expect(departmentDescription(undefined, undefined)).toBeNull();
  });

  it("joins a department's two descriptive fields", () => {
    expect(departmentDescription("Shooting & Production", undefined)).toBe("Shooting & Production");
    expect(departmentDescription("Shooting & Production", "Everything on camera")).toBe(
      "Shooting & Production -- Everything on camera",
    );
  });
});

describe("dayString", () => {
  it("gives a date column what it wants", () => {
    expect(dayString(new Date("2026-07-21T15:51:08.314Z"))).toBe("2026-07-21");
  });

  it("passes an absent or broken date through as null", () => {
    // Exactly one project and one task in the source have a deadline at all.
    expect(dayString(null)).toBeNull();
    expect(dayString(undefined)).toBeNull();
    expect(dayString(new Date("nonsense"))).toBeNull();
  });
});
