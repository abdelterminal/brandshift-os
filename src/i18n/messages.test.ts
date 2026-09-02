import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { routing } from "./routing";

/**
 * "Both locales ship together per screen; no half-translated states."
 *
 * That promise is only worth anything if something checks it. A key added to
 * `en` and forgotten in `fr` renders the key name to a French user, which is
 * exactly the half-translated state DECISIONS.md rules out -- so it fails the
 * build here instead.
 */

type Messages = Record<string, unknown>;

/** Every leaf key, dotted: `Nav.today`, `Search.groupProjects`. */
function leafKeys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object"
      ? leafKeys(value as Messages, path)
      : [path];
  });
}

/**
 * ICU argument names in a string: `{shortcut}`, `{count, plural, ...}`.
 *
 * This has to count braces rather than pattern-match, because a plural's
 * sub-messages are braced too and some of them are a single word:
 * `{count, plural, =0 {free} other {# tasks}}` has exactly one argument,
 * `count`, but any regex loose enough to catch `{shortcut}` also catches
 * `{free}`. It then reports the French `{disponible}` as a placeholder
 * mismatch -- a bug in the check, not in the translation.
 *
 * So: only the arguments at brace depth zero count, and each one is the word
 * before its first comma.
 */
function placeholders(value: string): string[] {
  const names: string[] = [];
  let depth = 0;

  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "}") {
      depth -= 1;
      continue;
    }
    if (value[i] !== "{") continue;

    if (depth === 0) {
      const rest = value.slice(i + 1);
      const name = /^\s*(\w+)\s*[,}]/.exec(rest);
      if (name) names.push(name[1]!);
    }
    depth += 1;
  }

  return names.sort();
}

function leafValues(messages: Messages, prefix = ""): Array<[string, string]> {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object"
      ? leafValues(value as Messages, path)
      : ([[path, String(value)]] as Array<[string, string]>);
  });
}

const CATALOGUES: Record<string, Messages> = { en, fr };

describe("message catalogues", () => {
  it("covers every configured locale", () => {
    expect(Object.keys(CATALOGUES).sort()).toEqual([...routing.locales].sort());
  });

  it("has the same keys in every locale", () => {
    const reference = leafKeys(en).sort();

    for (const [locale, messages] of Object.entries(CATALOGUES)) {
      const keys = leafKeys(messages).sort();

      const missing = reference.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !reference.includes(key));

      expect(missing, `${locale} is missing: ${missing.join(", ")}`).toEqual([]);
      expect(extra, `${locale} has keys en does not: ${extra.join(", ")}`).toEqual([]);
    }
  });

  it("uses the same ICU placeholders for the same key", () => {
    // A translation that drops `{query}` silently loses the search term.
    const reference = new Map(leafValues(en));

    for (const [locale, messages] of Object.entries(CATALOGUES)) {
      for (const [key, value] of leafValues(messages)) {
        const expected = placeholders(reference.get(key) ?? "");
        expect(placeholders(value), `${locale} ${key}`).toEqual(expected);
      }
    }
  });

  it("has no empty strings", () => {
    for (const [locale, messages] of Object.entries(CATALOGUES)) {
      for (const [key, value] of leafValues(messages)) {
        expect(value.trim(), `${locale} ${key} is empty`).not.toBe("");
      }
    }
  });

  it("does not leave English text sitting in the French catalogue", () => {
    // Not every French string differs -- "Français" and "English" are the same
    // in both, and so are proper nouns -- but the bulk of them must.
    const english = new Map(leafValues(en));
    const identical = leafValues(fr).filter(([key, value]) => english.get(key) === value);

    expect(identical.length / english.size).toBeLessThan(0.15);
  });
});
