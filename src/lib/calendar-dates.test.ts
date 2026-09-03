import { describe, expect, it } from "vitest";

import {
  addDays,
  dayKey,
  endOfMonth,
  instantFromLocal,
  localFromInstant,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "./calendar-dates";

/**
 * Calendar arithmetic, checked at the places it goes wrong.
 *
 * Every one of these is a real way a calendar loses somebody a day: an evening
 * meeting shown as tomorrow, a summer date an hour out because the offset was
 * assumed rather than measured, a month that ends on the 30th.
 */

const PARIS = "Europe/Paris";

describe("dayKey", () => {
  it("groups by the day it is here, not the day it is in UTC", () => {
    // 21:30 Paris in January is 20:30 UTC -- still the 15th either way.
    expect(dayKey(new Date("2026-01-15T20:30:00Z"), PARIS)).toBe("2026-01-15");

    // 00:30 Paris on the 16th is 23:30 UTC on the 15th. The person sitting in
    // Paris is at a meeting that started today, and the calendar must agree.
    expect(dayKey(new Date("2026-01-15T23:30:00Z"), PARIS)).toBe("2026-01-16");
  });

  it("handles summer time, where the offset is different", () => {
    // 23:30 UTC in July is 01:30 the next day in Paris (+02:00).
    expect(dayKey(new Date("2026-07-15T23:30:00Z"), PARIS)).toBe("2026-07-16");
    expect(dayKey(new Date("2026-07-15T21:30:00Z"), PARIS)).toBe("2026-07-15");
  });
});

describe("startOfDay", () => {
  it("measures the offset rather than assuming one", () => {
    // Winter: Paris is +01:00, so local midnight is 23:00 UTC the day before.
    expect(startOfDay("2026-01-15", PARIS).toISOString()).toBe("2026-01-14T23:00:00.000Z");

    // Summer: +02:00. A fixed offset would put every summer day an hour out.
    expect(startOfDay("2026-07-15", PARIS).toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("round-trips with dayKey", () => {
    for (const day of ["2026-01-01", "2026-03-29", "2026-07-15", "2026-10-25", "2026-12-31"]) {
      expect(dayKey(startOfDay(day, PARIS), PARIS)).toBe(day);
    }
  });

  it("is UTC-safe when the zone is UTC", () => {
    expect(startOfDay("2026-09-03", "UTC").toISOString()).toBe("2026-09-03T00:00:00.000Z");
  });
});

describe("addDays", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is not thrown off by a daylight-saving change", () => {
    // The clocks go forward on 29 March 2026. As plain labels, the days either
    // side are still one apart -- which is exactly why they are labels.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("weeks and months", () => {
  it("starts the week on Monday", () => {
    // 2026-09-03 is a Thursday.
    expect(startOfWeek("2026-09-03")).toBe("2026-08-31");
    // A Monday is its own start; a Sunday belongs to the week that just ended.
    expect(startOfWeek("2026-08-31")).toBe("2026-08-31");
    expect(startOfWeek("2026-09-06")).toBe("2026-08-31");
  });

  it("bounds a month exclusively at the far end", () => {
    expect(startOfMonth("2026-09-17")).toBe("2026-09-01");
    expect(endOfMonth("2026-09-17")).toBe("2026-10-01");

    // February, including a leap year, is where an off-by-one shows up.
    expect(endOfMonth("2026-02-10")).toBe("2026-03-01");
    expect(endOfMonth("2028-02-10")).toBe("2028-03-01");
    expect(endOfMonth("2026-12-01")).toBe("2027-01-01");
  });
});

describe("wall clock and instants", () => {
  it("reads a form time as the organization's clock, not the browser's", () => {
    // 14:30 in Paris in September is 12:30 UTC (+02:00).
    expect(instantFromLocal("2026-09-03T14:30", PARIS)?.toISOString()).toBe(
      "2026-09-03T12:30:00.000Z",
    );

    // The same wall-clock time in January is 13:30 UTC (+01:00). A fixed
    // offset would put every winter meeting an hour out.
    expect(instantFromLocal("2026-01-15T14:30", PARIS)?.toISOString()).toBe(
      "2026-01-15T13:30:00.000Z",
    );
  });

  it("round-trips", () => {
    for (const local of ["2026-01-15T09:00", "2026-07-15T18:45", "2026-09-03T00:00"]) {
      const at = instantFromLocal(local, PARIS)!;
      expect(localFromInstant(at, PARIS)).toBe(local);
    }
  });

  it("renders midnight as 00, not 24", () => {
    const midnight = instantFromLocal("2026-09-03T00:00", PARIS)!;
    expect(localFromInstant(midnight, PARIS)).toBe("2026-09-03T00:00");
  });

  it("refuses anything that is not a form time", () => {
    for (const bad of ["", "2026-09-03", "not a date", "2026-13-40T99:99"]) {
      expect(instantFromLocal(bad, PARIS)).toBeNull();
    }
  });
});
