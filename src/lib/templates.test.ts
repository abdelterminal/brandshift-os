import { describe, expect, it } from "vitest";

import {
  daysBetween,
  dueDateFor,
  fromProjectTasks,
  fromSopSteps,
  parseOffset,
  scheduleFor,
  templateSpanDays,
  MAX_OFFSET_DAYS,
} from "./templates";

/**
 * Turning a template into real dates.
 *
 * A template that quietly puts every deadline in the wrong week is worse than
 * no template at all: people trust it, because it came from the last time the
 * job went well.
 */

describe("dueDateFor", () => {
  it("counts calendar days from the project's start", () => {
    expect(dueDateFor("2026-09-07", 0)).toBe("2026-09-07");
    expect(dueDateFor("2026-09-07", 14)).toBe("2026-09-21");
  });

  it("counts calendar days rather than working days", () => {
    // Day 5 from a Monday is a Saturday, and that is what "day five" means.
    // Turning it into six working days would surprise whoever wrote the
    // template; the weekend rule belongs to leave, where an allowance is
    // actually being spent.
    expect(dueDateFor("2026-09-07", 5)).toBe("2026-09-12");
  });

  it("crosses a month and a year without drama", () => {
    expect(dueDateFor("2026-12-20", 20)).toBe("2027-01-09");
  });

  it("gives no date when the task has none", () => {
    // Plenty of work genuinely has no deadline, and inventing one so the
    // column is never empty is how a board fills up with dates nobody believes.
    expect(dueDateFor("2026-09-07", null)).toBeNull();
  });

  it("clamps rather than producing a date before the project starts", () => {
    expect(dueDateFor("2026-09-07", -10)).toBe("2026-09-07");
    expect(dueDateFor("2026-09-07", MAX_OFFSET_DAYS + 500)).toBe(
      dueDateFor("2026-09-07", MAX_OFFSET_DAYS),
    );
  });
});

describe("scheduleFor", () => {
  it("dates the whole template in one pass", () => {
    const schedule = scheduleFor("2026-09-07", [
      { title: "Kickoff", description: null, priority: "high", offsetDays: 0 },
      { title: "First cut", description: null, priority: "medium", offsetDays: 14 },
      { title: "Tidy the archive", description: null, priority: "low", offsetDays: null },
    ]);

    expect(schedule.map((task) => task.dueDate)).toEqual(["2026-09-07", "2026-09-21", null]);
    // Everything else survives untouched.
    expect(schedule[0].priority).toBe("high");
    expect(schedule[1].title).toBe("First cut");
  });

  it("is empty for an empty template", () => {
    expect(scheduleFor("2026-09-07", [])).toEqual([]);
  });
});

describe("parseOffset", () => {
  it("reads a whole number of days", () => {
    expect(parseOffset("0")).toEqual({ ok: true, value: 0 });
    expect(parseOffset("14")).toEqual({ ok: true, value: 14 });
    expect(parseOffset("  30 ")).toEqual({ ok: true, value: 30 });
  });

  it("treats blank as no deadline, which is a real answer", () => {
    expect(parseOffset("")).toEqual({ ok: true, value: null });
    expect(parseOffset("   ")).toEqual({ ok: true, value: null });
  });

  it("refuses anything that is not a whole number of days", () => {
    // Reading these as zero would silently put a deadline on the first day of
    // the project without anybody asking for one.
    for (const bad of ["two weeks", "1.5", "-3", "1e3", "14 days"]) {
      expect(parseOffset(bad), bad).toEqual({ ok: false });
    }
  });

  it("refuses an offset years out", () => {
    expect(parseOffset(String(MAX_OFFSET_DAYS + 1))).toEqual({ ok: false });
  });
});

describe("templateSpanDays", () => {
  it("is the furthest deadline out", () => {
    expect(
      templateSpanDays([
        { title: "a", description: null, priority: "medium", offsetDays: 0 },
        { title: "b", description: null, priority: "medium", offsetDays: 30 },
        { title: "c", description: null, priority: "medium", offsetDays: 14 },
      ]),
    ).toBe(30);
  });

  it("is null when nothing in the template has a date", () => {
    expect(
      templateSpanDays([{ title: "a", description: null, priority: "medium", offsetDays: null }]),
    ).toBeNull();
    expect(templateSpanDays([])).toBeNull();
  });
});

describe("fromSopSteps", () => {
  it("keeps the words and the order, and invents no schedule", () => {
    const tasks = fromSopSteps([
      { title: "Confirm the dates in writing", detail: "Email, not a call." },
      { title: "Book the crew", detail: null },
    ]);

    expect(tasks.map((task) => task.title)).toEqual([
      "Confirm the dates in writing",
      "Book the crew",
    ]);
    expect(tasks[0].description).toBe("Email, not a call.");

    // A procedure says what happens and in what order. It says nothing about
    // how long each part takes, and spreading its steps one per day would be
    // inventing a schedule nobody wrote.
    expect(tasks.every((task) => task.offsetDays === null)).toBe(true);
  });
});

describe("fromProjectTasks", () => {
  it("keeps a project's shape rather than its calendar", () => {
    const tasks = fromProjectTasks("2026-01-05", [
      { title: "Kickoff", description: null, priority: "high", dueDate: "2026-01-05" },
      { title: "Delivery", description: null, priority: "urgent", dueDate: "2026-02-04" },
    ]);

    expect(tasks.map((task) => task.offsetDays)).toEqual([0, 30]);
    expect(tasks[1].priority).toBe("urgent");
  });

  it("clamps a task that was due before the project officially started", () => {
    // Start dates get set after the fact, so this happens.
    const tasks = fromProjectTasks("2026-01-05", [
      { title: "Early", description: null, priority: "medium", dueDate: "2025-12-20" },
    ]);

    expect(tasks[0].offsetDays).toBe(0);
  });

  it("carries no offset when there is nothing to measure from", () => {
    const undated = fromProjectTasks(null, [
      { title: "x", description: null, priority: "medium", dueDate: "2026-02-04" },
    ]);
    expect(undated[0].offsetDays).toBeNull();

    const noDeadline = fromProjectTasks("2026-01-05", [
      { title: "x", description: null, priority: "medium", dueDate: null },
    ]);
    expect(noDeadline[0].offsetDays).toBeNull();
  });
});

describe("daysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-01-05", "2026-02-04")).toBe(30);
    expect(daysBetween("2026-02-04", "2026-01-05")).toBe(-30);
    expect(daysBetween("2026-01-05", "2026-01-05")).toBe(0);
  });

  it("is not thrown off by a daylight-saving change", () => {
    // European clocks go forward on 29 March 2026. Counted in UTC, so the
    // answer is a whole number of days rather than 30.958.
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });
});
