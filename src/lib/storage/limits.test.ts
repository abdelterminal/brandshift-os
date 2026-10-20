import { describe, expect, it } from "vitest";

import {
  ALLOWED_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_DOCUMENT,
  refuseUpload,
  storageKeyFor,
} from "./limits";

/**
 * The rules standing between a file input and this deployment's one volume.
 *
 * Worth asserting rather than reading, because `DECISIONS.md` refused uploads
 * for years on the grounds that there was "no size limit worth the name" and
 * nothing bounding disk growth. These are that limit; a regression here is a
 * regression in the argument for having the feature at all.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";

const ok = { sizeBytes: 1024, mimeType: "application/pdf", existingCount: 0 };

describe("refuseUpload", () => {
  it("allows an ordinary PDF", () => {
    expect(refuseUpload(ok)).toBeNull();
  });

  it("allows every type on the allowlist", () => {
    for (const mimeType of Object.keys(ALLOWED_TYPES)) {
      expect(refuseUpload({ ...ok, mimeType }), mimeType).toBeNull();
    }
  });

  it("refuses a file over the size cap, and allows one exactly at it", () => {
    expect(refuseUpload({ ...ok, sizeBytes: MAX_FILE_BYTES + 1 })).toBe("fileTooLarge");
    expect(refuseUpload({ ...ok, sizeBytes: MAX_FILE_BYTES })).toBeNull();
  });

  it("refuses an empty file as empty, not as too large", () => {
    expect(refuseUpload({ ...ok, sizeBytes: 0 })).toBe("fileEmpty");
  });

  it("refuses a type that is not on the allowlist", () => {
    for (const mimeType of [
      "application/x-msdownload",
      "text/html",
      "application/zip",
      "", // a browser that sent nothing
    ]) {
      expect(refuseUpload({ ...ok, mimeType }), mimeType).toBe("fileTypeNotAllowed");
    }
  });

  it("refuses SVG, which is an image that can carry script", () => {
    expect(refuseUpload({ ...ok, mimeType: "image/svg+xml" })).toBe("fileTypeNotAllowed");
  });

  it("refuses once the document is full", () => {
    expect(refuseUpload({ ...ok, existingCount: MAX_FILES_PER_DOCUMENT - 1 })).toBeNull();
    expect(refuseUpload({ ...ok, existingCount: MAX_FILES_PER_DOCUMENT })).toBe("tooManyFiles");
  });
});

describe("storageKeyFor", () => {
  it("is built from ids and the type's own extension", () => {
    expect(storageKeyFor(ORG, ID, "application/pdf")).toBe(`${ORG}/${ID}.pdf`);
    expect(storageKeyFor(ORG, ID, "image/jpeg")).toBe(`${ORG}/${ID}.jpg`);
  });

  it("never contains anything from an uploaded filename", () => {
    // The whole point: the name a browser sent is attacker-controlled text and
    // simply is not an input here, so there is nothing to sanitise.
    const key = storageKeyFor(ORG, ID, "image/png");
    expect(key).not.toMatch(/\.\./);
    expect(key.split("/")).toHaveLength(2);
  });

  it("gives two uploads two keys", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    expect(storageKeyFor(ORG, ID, "application/pdf")).not.toBe(
      storageKeyFor(ORG, other, "application/pdf"),
    );
  });

  it("throws rather than invent an extension for a type it does not know", () => {
    expect(() => storageKeyFor(ORG, ID, "application/x-msdownload")).toThrow();
  });
});
