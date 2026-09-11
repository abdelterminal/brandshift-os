"use client";

import { cn } from "@/lib/utils";

import { focusRing } from "./styles";

/**
 * The draggable divider between two resizable panes -- a queue column, a
 * table header. No visible line in any state, hover or drag included -- the
 * cursor changing over its (wider than 1px) hit target is the only
 * affordance, and a line on the container edge read as clutter whenever it
 * showed at all.
 *
 * Keyboard-operable too -- `role="separator"` plus arrow keys, the
 * "window splitter" pattern -- so resizing is not mouse-only. A focusable
 * separator is a window-splitter widget as far as ARIA is concerned, which
 * makes `aria-valuenow` (and the min/max either side of it) required, not
 * optional -- axe fails the build on a `role="separator"` missing it. The
 * focus ring itself still shows, so a keyboard user tabbing through never
 * loses track of it the way the mouse affordance does.
 */
export function ResizeHandle({
  label,
  valueNow,
  valueMin,
  valueMax,
  onPointerDown,
  onKeyDown,
  className,
}: {
  label: string;
  /** The current, min and max width this handle's pane can take, in px. */
  valueNow: number;
  valueMin: number;
  valueMax: number;
  onPointerDown: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(valueNow)}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute top-0 z-10 h-full w-3 cursor-col-resize touch-none outline-none",
        focusRing,
        className,
      )}
    />
  );
}
