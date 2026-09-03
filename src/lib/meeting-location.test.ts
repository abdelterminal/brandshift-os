import { describe, expect, it } from "vitest";

import { readLocation, shortLocation } from "./meeting-location";

/**
 * The interesting cases are the ones where a typed string later becomes an
 * `href`: anything that is not http or https must not become a link.
 */
describe("readLocation", () => {
  it("treats a room as text", () => {
    expect(readLocation("Studio room 2")).toEqual({ kind: "text", text: "Studio room 2" });
    expect(readLocation("  Main room  ")).toEqual({ kind: "text", text: "Main room" });
  });

  it("treats a web address as a link, and keeps its host for the short form", () => {
    expect(readLocation("https://meet.brandshift.test/northwind")).toEqual({
      kind: "link",
      href: "https://meet.brandshift.test/northwind",
      host: "meet.brandshift.test",
    });
    expect(shortLocation("https://meet.brandshift.test/northwind")).toBe("meet.brandshift.test");
  });

  it("refuses to make a link out of any other scheme", () => {
    // A location is typed by a person and ends up in an `href`. Anything but
    // http and https stays inert text, however URL-shaped it looks.
    for (const hostile of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(readLocation(hostile)).toEqual({ kind: "text", text: hostile });
    }
  });

  it("is null when there is nowhere to be", () => {
    expect(readLocation(null)).toBeNull();
    expect(readLocation("")).toBeNull();
    expect(readLocation("   ")).toBeNull();
    expect(shortLocation(null)).toBeNull();
  });
});
