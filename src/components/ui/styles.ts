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
