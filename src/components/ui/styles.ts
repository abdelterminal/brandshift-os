/**
 * Shared style fragments.
 *
 * Every primitive needs the same focus ring, the same disabled treatment and
 * the same transition. Writing them once means a control cannot accidentally
 * ship without one -- which is the failure mode the rule
 * "no interactive element without hover, focus-visible, active, disabled and
 * loading states" exists to prevent.
 */

/**
 * One focus treatment everywhere. `focus-visible` only, so a pointer click
 * never draws a ring but a keyboard tab always does.
 */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid";

/** Focus ring for controls flush against a container edge, e.g. list rows. */
export const focusRingInset =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid";

/**
 * Disabled reads as "not available now", not "broken". Base UI sets
 * `data-disabled` on non-native elements, and native controls get `:disabled`,
 * so both are covered.
 */
export const disabled =
  "disabled:pointer-events-none disabled:opacity-55 data-disabled:pointer-events-none data-disabled:opacity-55";

/**
 * Colour only, inside the 120-180ms band. Nothing here moves an element --
 * no translate, no scale -- so a dense table never jitters under the cursor.
 */
export const transition =
  "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]";

/** For overlays, where opacity is the thing that changes. */
export const transitionOpacity =
  "transition-opacity duration-[var(--duration-base)] ease-[var(--ease-out)]";

/** Popup surfaces: menus, selects, tooltips, popovers. */
export const popupSurface =
  "bg-surface-overlay border-border rounded-card border shadow-popover";

/**
 * Hover for a link that already reads as one at rest -- a cross-reference
 * inside running text or a `<dd>` (which company a deal is with, where a
 * meeting is), underlined permanently rather than only on hover, so it needs
 * its own real hover cue on top of that. Two constraints rule out the usual
 * options: there is no neutral bolder than `fg-default` to hover into (it is
 * already the boldest token this app has), and the brand accent is reserved
 * for actions -- "you are over a link" is not one of the four things red is
 * allowed to mean. So the cue is the same quiet background every other
 * secondary control already hovers to. The padding is matched by a negative
 * margin so it does not nudge the text sitting next to it.
 */
export const quietLinkHover = "hover:bg-surface-hover px-1 -mx-1 py-0.5 -my-0.5";
