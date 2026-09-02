import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `cn` -- merge class names, last conflicting utility wins.
 *
 * tailwind-merge has to be told about our scales. Out of the box it knows
 * `text-sm` is a font size and `text-red-500` is a colour, and decides which
 * group an unknown `text-*` belongs to by looking at the value. `text-label`
 * and `text-caption` are not values it recognises, so it filed them as
 * colours -- which made them conflict with real colours and silently drop one.
 *
 * That bug shipped invisibly: `cn("text-accent-fg", "text-label")` returned
 * only `text-label`, so every primary button lost its white label and inherited
 * near-black text on red. The scales below are what stop that recurring, and
 * `utils.test.ts` pins the behaviour.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // Mirrors the type scale in tokens.css.
      "font-size": [
        {
          text: [
            "display-lg",
            "display",
            "heading-lg",
            "heading",
            "body-lg",
            "body",
            "label",
            "caption",
          ],
        },
      ],
      // Mirrors the radii in tokens.css: 8px controls, 12px cards, 16px surfaces.
      rounded: [{ rounded: ["control", "card", "surface", "pill"] }],
      shadow: [{ shadow: ["card", "popover", "overlay"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
