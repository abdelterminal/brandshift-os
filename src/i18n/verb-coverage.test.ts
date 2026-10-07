import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

/**
 * Every verb the app records can be read back in words.
 *
 * Two separate catalogues render the same events and both have been silently
 * incomplete in production:
 *
 * - `Activity` is the feed on a project or a person. Fifteen recorded verbs had
 *   no entry at all.
 * - `Notification` is the inbox and the corner toasts. The five `member.*`
 *   verbs added with the admin panel had no entry, and the inbox showed a row
 *   reading, in full, "Notification.memberPasswordReset".
 *
 * Neither failed loudly. next-intl returns the key path for a missing key
 * rather than throwing, so the `catch` in `describeNotification` -- which does
 * catch a *formatting* error -- never fired, and the key went to screen as if
 * it were a sentence. Nothing short of looking at the inbox would have caught
 * it, which is why it is checked here instead.
 *
 * The verbs are read out of the source rather than listed, so adding one to
 * `recordActivity` without its copy fails this test rather than shipping.
 */

const SRC = join(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** `task.completed` becomes `taskCompleted`, as both catalogues key them. */
function messageKey(verb: string): string {
  return verb
    .split(".")
    .map((part, index) => (index === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join("");
}

const SOURCE = sourceFiles(SRC)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

/** Every verb written to the activity log, from the `recordActivity` calls. */
const recorded = [
  ...new Set([...SOURCE.matchAll(/verb:\s*"([a-z]+\.[a-zA-Z]+)"/g)].map((m) => m[1]!)),
].sort();

/**
 * The verbs that reach somebody's inbox -- the `case` labels in
 * `recipientsFor`. A verb with no case produces no notification at all, so it
 * needs no `Notification` entry; one with a case always does.
 */
const notifying = [
  ...new Set(
    [...SOURCE.matchAll(/^\s*case "([a-z]+\.[a-zA-Z]+)":/gm)].map((m) => m[1]!),
  ),
].sort();

describe("every recorded verb has words", () => {
  it("found the verbs to check", () => {
    // A regex that silently matched nothing would make every assertion below
    // pass without testing anything.
    expect(recorded.length).toBeGreaterThan(30);
    expect(notifying.length).toBeGreaterThan(10);
  });

  it("has an Activity entry in both locales", () => {
    for (const [locale, catalogue] of Object.entries({ en, fr })) {
      const activity = catalogue.Activity as Record<string, string>;
      const missing = recorded.filter((verb) => !(messageKey(verb) in activity));
      expect(missing, `${locale} Activity is missing: ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("has a Notification entry in both locales for anything that notifies", () => {
    for (const [locale, catalogue] of Object.entries({ en, fr })) {
      const notification = catalogue.Notification as Record<string, string>;
      const missing = notifying.filter((verb) => !(messageKey(verb) in notification));
      expect(missing, `${locale} Notification is missing: ${missing.join(", ")}`).toEqual([]);
    }
  });
});
