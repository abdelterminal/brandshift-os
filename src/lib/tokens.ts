import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads `src/app/tokens.css` and answers what a token actually resolves to in
 * a given theme.
 *
 * Both the contrast test and the /design reference page use this, so the
 * numbers printed on that page are the numbers the build enforces -- there is
 * no second copy of the palette to drift out of step with the first.
 */

export type Theme = "light" | "dark";

type Block = { chain: string[]; declarations: Map<string, string> };

function parseBlocks(css: string): Block[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Block[] = [];

  function walk(text: string, chain: string[]) {
    let index = 0;
    let head = "";

    while (index < text.length) {
      if (text[index] === "{") {
        let depth = 1;
        let end = index + 1;
        while (end < text.length && depth > 0) {
          if (text[end] === "{") depth += 1;
          if (text[end] === "}") depth -= 1;
          end += 1;
        }

        const body = text.slice(index + 1, end - 1);
        const nextChain = [...chain, head.trim()];

        if (body.includes("{")) {
          walk(body, nextChain);
        } else {
          const declarations = new Map<string, string>();
          for (const line of body.split(";")) {
            const match = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(line);
            if (match) declarations.set(match[1]!, match[2]!.replace(/\s+/g, " "));
          }
          blocks.push({ chain: nextChain, declarations });
        }

        head = "";
        index = end;
        continue;
      }

      head += text[index];
      index += 1;
    }
  }

  walk(source, []);
  return blocks;
}

function merge(blocks: Block[], keep: (chain: string[]) => boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of blocks) {
    if (!keep(block.chain)) continue;
    for (const [name, value] of block.declarations) out.set(name, value);
  }
  return out;
}

export type TokenTable = {
  /** Primitives plus the light semantic layer. */
  root: Map<string, string>;
  /** Dark, as declared under the `prefers-color-scheme` media query. */
  darkMedia: Map<string, string>;
  /** Dark, as declared under `[data-theme="dark"]`. */
  darkAttr: Map<string, string>;
  /** Declarations under `prefers-reduced-motion`. */
  reducedMotion: Map<string, string>;
};

let cached: TokenTable | undefined;

export function readTokens(cssPath = join(process.cwd(), "src/app/tokens.css")): TokenTable {
  if (cached) return cached;

  const blocks = parseBlocks(readFileSync(cssPath, "utf8"));
  const inMedia = (chain: string[]) => chain.some((part) => part.startsWith("@media"));

  cached = {
    // `:root[data-theme="dark"]` also starts with `:root` and sits outside any
    // media query, so it has to be excluded explicitly -- otherwise it merges
    // into the light map, silently overwrites it, and every "light" lookup
    // quietly returns dark values.
    root: merge(
      blocks,
      (chain) =>
        !inMedia(chain) &&
        chain.every((p) => p.startsWith(":root")) &&
        !chain.some((p) => p.includes("[data-theme")),
    ),
    darkMedia: merge(blocks, (chain) =>
      chain.some((part) => part.includes("prefers-color-scheme: dark")),
    ),
    darkAttr: merge(
      blocks,
      (chain) => !inMedia(chain) && chain.some((p) => p.includes('[data-theme="dark"]')),
    ),
    reducedMotion: merge(blocks, (chain) =>
      chain.some((part) => part.includes("prefers-reduced-motion")),
    ),
  };

  return cached;
}

/** Resolve a token through its `var()` chain within one theme. */
export function resolveToken(token: string, theme: Theme, table = readTokens()): string {
  const overlay = theme === "dark" ? table.darkAttr : new Map<string, string>();
  let value = overlay.get(token) ?? table.root.get(token);

  for (let hops = 0; hops < 12; hops += 1) {
    if (value === undefined) break;
    const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value.trim());
    if (!reference) return value.trim();
    const next = reference[1]!;
    value = overlay.get(next) ?? table.root.get(next);
  }

  if (value === undefined) throw new Error(`Token ${token} does not resolve in ${theme}`);
  return value.trim();
}

// --- WCAG ------------------------------------------------------------------

function toRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a hex colour: ${hex}`);
  const int = parseInt(match[1]!, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Contrast between two tokens as they resolve in one theme. */
export function tokenContrast(fg: string, bg: string, theme: Theme): number {
  return contrastRatio(resolveToken(fg, theme), resolveToken(bg, theme));
}

/** Every step of a primitive ramp, in ramp order. */
export function ramp(prefix: string, table = readTokens()): Array<[string, string]> {
  return [...table.root.entries()]
    .filter(([name]) => new RegExp(`^--${prefix}-\\d+$`).test(name))
    .sort((a, b) => Number(a[0].split("-").pop()) - Number(b[0].split("-").pop()));
}
