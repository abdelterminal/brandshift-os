import { describe, expect, it } from "vitest";

import { contrastRatio, luminance, readTokens, resolveToken, type Theme } from "@/lib/tokens";

/**
 * The palette's guarantees, enforced.
 *
 * "Contrast-checked to WCAG AA" is worth nothing as a claim in a document --
 * the next person to nudge a ramp step would never see it. So the check lives
 * here: it resolves every semantic token through its `var()` chain in both
 * themes and fails the build on any pair that drops below AA.
 *
 * 4.5:1 for text (WCAG 1.4.3) and 3:1 for control boundaries and focus rings
 * (WCAG 1.4.11).
 *
 * The parser is shared with the /design reference page, so the ratios printed
 * there are the ratios enforced here.
 */

const TOKENS = readTokens();
const { root: ROOT, darkMedia: DARK_MEDIA, darkAttr: DARK_ATTR } = TOKENS;

const THEMES: Theme[] = ["light", "dark"];

/** [foreground, background, minimum ratio] */
type Pair = [string, string, number];

const TEXT_ON_SURFACE: Pair[] = [
  ["--fg-default", "--surface-base", 4.5],
  ["--fg-default", "--surface-raised", 4.5],
  ["--fg-default", "--surface-sunken", 4.5],
  ["--fg-default", "--surface-overlay", 4.5],
  ["--fg-default", "--surface-inset", 4.5],
  ["--fg-muted", "--surface-base", 4.5],
  ["--fg-muted", "--surface-raised", 4.5],
  ["--fg-muted", "--surface-sunken", 4.5],
  ["--fg-muted", "--surface-overlay", 4.5],
  ["--fg-subtle", "--surface-base", 4.5],
  ["--fg-subtle", "--surface-raised", 4.5],
  ["--accent-text", "--surface-base", 4.5],
  ["--accent-text", "--surface-raised", 4.5],
];

/**
 * Filled controls that carry a label. Status `-solid` tokens are deliberately
 * absent: they are dots, bars and indicators, never a background for text, and
 * they are checked as non-text marks below instead.
 */
const TEXT_ON_FILL: Pair[] = [
  ["--fg-on-accent", "--accent", 4.5],
  ["--fg-on-accent", "--accent-hover", 4.5],
  ["--fg-on-accent", "--accent-active", 4.5],
];

const STATUS_PILLS: Pair[] = [
  ["--status-complete-text", "--status-complete-bg", 4.5],
  ["--status-attention-text", "--status-attention-bg", 4.5],
  ["--status-active-text", "--status-active-bg", 4.5],
  ["--status-blocked-text", "--status-blocked-bg", 4.5],
  ["--status-neutral-text", "--status-neutral-bg", 4.5],
];

/** Non-text: control edges, focus rings, status dots. WCAG 1.4.11. */
const NON_TEXT: Pair[] = [
  ["--border-control", "--surface-base", 3],
  ["--border-control", "--surface-raised", 3],
  ["--focus-ring", "--surface-base", 3],
  ["--focus-ring", "--surface-raised", 3],
  ["--focus-ring", "--surface-overlay", 3],
  ["--status-complete-solid", "--surface-base", 3],
  ["--status-attention-solid", "--surface-base", 3],
  ["--status-active-solid", "--surface-base", 3],
  ["--status-blocked-solid", "--surface-base", 3],
  ["--accent", "--surface-base", 3],
];

const SIDEBAR: Pair[] = [
  ["--sidebar-fg", "--sidebar-surface", 4.5],
  ["--sidebar-fg-active", "--sidebar-surface", 4.5],
  ["--sidebar-fg-active", "--sidebar-active-bg", 4.5],
  ["--sidebar-fg", "--sidebar-hover", 4.5],
];

describe("tokens parse", () => {
  it("finds the primitive and light block", () => {
    expect(ROOT.get("--red-500")).toBe("#fd0000");
    expect(ROOT.has("--surface-base")).toBe(true);
  });

  it("finds both dark blocks", () => {
    expect(DARK_MEDIA.size).toBeGreaterThan(20);
    expect(DARK_ATTR.size).toBeGreaterThan(20);
  });
});

describe("the two themes are actually two themes", () => {
  /**
   * Regression guard. `:root[data-theme="dark"]` also starts with `:root`, so
   * an over-broad light-block filter merges it into the light map and every
   * "light" lookup silently returns dark values -- which makes every light
   * contrast assertion below a second copy of the dark ones, passing happily
   * while checking nothing.
   */
  it("resolves the canvas differently in light and dark", () => {
    expect(resolveToken("--surface-base", "light")).not.toBe(
      resolveToken("--surface-base", "dark"),
    );
    expect(resolveToken("--fg-default", "light")).not.toBe(
      resolveToken("--fg-default", "dark"),
    );
  });

  it("keeps light on the light end and dark on the dark end", () => {
    const lightCanvas = luminance(resolveToken("--surface-base", "light"));
    const darkCanvas = luminance(resolveToken("--surface-base", "dark"));
    expect(lightCanvas).toBeGreaterThan(0.8);
    expect(darkCanvas).toBeLessThan(0.05);
  });

  it("never lets the dark canvas reach pure black", () => {
    // "Charcoal surfaces, never pure black."
    expect(resolveToken("--surface-base", "dark")).not.toBe("#000000");
    expect(luminance(resolveToken("--surface-base", "dark"))).toBeGreaterThan(0);
  });
});

describe("brand", () => {
  it("keeps #FD0000 as the anchor of the red ramp", () => {
    // The brand colour is a given, not a design choice this file gets to make.
    expect(ROOT.get("--red-500")).toBe("#fd0000");
  });

  it("keeps --brand pointing at it in both themes", () => {
    for (const theme of THEMES) {
      expect(resolveToken("--brand", theme), theme).toBe("#fd0000");
    }
  });
});

describe("the two dark blocks stay in step", () => {
  it("declare exactly the same tokens", () => {
    expect([...DARK_ATTR.keys()].sort()).toEqual([...DARK_MEDIA.keys()].sort());
  });

  it("declare exactly the same values", () => {
    for (const [name, value] of DARK_MEDIA) {
      expect(DARK_ATTR.get(name), `${name} differs between the dark blocks`).toBe(value);
    }
  });

  it("override every semantic token light defines a colour for", () => {
    // A light-only token would keep its light value on a dark canvas, which is
    // the single most common way a dark theme ends up with an unreadable patch.
    const semantic = [...ROOT.keys()].filter((name) =>
      /^--(surface|fg|border|accent|brand|focus|status|sidebar|scrim|shadow)/.test(name),
    );

    const missing = semantic.filter((name) => !DARK_MEDIA.has(name));
    expect(missing, `not re-declared for dark: ${missing.join(", ")}`).toEqual([]);
  });
});

describe.each(THEMES)("%s contrast", (theme) => {
  const check = (pairs: Pair[]) => {
    for (const [fg, bg, minimum] of pairs) {
      const fgHex = resolveToken(fg, theme);
      const bgHex = resolveToken(bg, theme);
      const ratio = contrastRatio(fgHex, bgHex);

      expect(
        Number(ratio.toFixed(2)),
        `${theme}: ${fg} (${fgHex}) on ${bg} (${bgHex}) is ${ratio.toFixed(2)}:1, needs ${minimum}:1`,
      ).toBeGreaterThanOrEqual(minimum);
    }
  };

  it("text on every surface reaches 4.5:1", () => check(TEXT_ON_SURFACE));
  it("text on every filled control reaches 4.5:1", () => check(TEXT_ON_FILL));
  it("status pills reach 4.5:1", () => check(STATUS_PILLS));
  it("control edges, focus rings and dots reach 3:1", () => check(NON_TEXT));
  it("the sidebar reaches 4.5:1", () => check(SIDEBAR));
});

describe("type scale", () => {
  const sizes = [...ROOT.entries()].filter(([name]) => /^--text-/.test(name));

  it("has a scale", () => {
    expect(sizes.length).toBeGreaterThanOrEqual(8);
  });

  it("puts nothing below 12px", () => {
    // The old app had 184 instances of meaningful text below 12px. There is no
    // token here that can reproduce that.
    for (const [name, value] of sizes) {
      const rem = Number(/^([\d.]+)rem$/.exec(value)?.[1]);
      expect(Number.isFinite(rem), `${name} is not a rem value`).toBe(true);
      expect(rem * 16, `${name} is ${rem * 16}px`).toBeGreaterThanOrEqual(12);
    }
  });

  it("keeps body text in the 14-16px band", () => {
    expect(ROOT.get("--text-body")).toBe("0.875rem"); // 14px
    expect(ROOT.get("--text-body-lg")).toBe("1rem"); // 16px
  });
});

describe("shape and motion", () => {
  it("uses the three specified radii", () => {
    expect(ROOT.get("--radius-control")).toBe("8px");
    expect(ROOT.get("--radius-card")).toBe("12px");
    expect(ROOT.get("--radius-surface")).toBe("16px");
  });

  it("keeps every duration in the 120-180ms band", () => {
    for (const name of ["--duration-fast", "--duration-base", "--duration-slow"]) {
      const ms = Number(/^(\d+)ms$/.exec(ROOT.get(name) ?? "")?.[1]);
      expect(ms, `${name} is ${ms}ms`).toBeGreaterThanOrEqual(120);
      expect(ms, `${name} is ${ms}ms`).toBeLessThanOrEqual(180);
    }
  });

  it("collapses motion when the viewer asks for less", () => {
    expect(TOKENS.reducedMotion.get("--duration-base")).toBe("1ms");
  });
});

describe("no component-visible token is left undefined", () => {
  it("resolves every var() reference in both themes", () => {
    const referenced = new Set<string>();
    for (const map of [ROOT, DARK_MEDIA, DARK_ATTR]) {
      for (const value of map.values()) {
        for (const match of value.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
          referenced.add(match[1]!);
        }
      }
    }

    for (const token of referenced) {
      for (const theme of THEMES) {
        expect(() => resolveToken(token, theme), `${token} in ${theme}`).not.toThrow();
      }
    }
  });
});
