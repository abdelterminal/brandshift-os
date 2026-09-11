"use client";

import { cn } from "@/lib/utils";

import { focusRing, transition } from "./styles";

/**
 * The draggable divider between two resizable panes -- a queue column, a
 * table header. Invisible at rest -- the cursor already changes over its
 * (wider than 1px) hit target, and a permanent line on every container edge
 * read as clutter rather than affordance -- and a thin line only once
 * hovered or actively dragged, in the existing border ramp: a resize handle
 * is not one of the four things the brand accent is allowed to mean, either
 * way.
 *
 * Keyboard-operable too -- `role="separator"` plus arrow keys, the
 * "window splitter" pattern -- so resizing is not mouse-only. A focusable
 * separator is a window-splitter widget as far as ARIA is concerned, which
 * makes `aria-valuenow` (and the min/max either side of it) required, not
 * optional -- axe fails the build on a `role="separator"` missing it. The
 * focus ring itself still shows at rest, on the outer hit target, so a
 * keyboard user tabbing through never loses track of it the way the mouse
 * affordance now does.
 */
export function ResizeHandle({
  label,
  dragging,
  valueNow,
  valueMin,
  valueMax,
  onPointerDown,
  onKeyDown,
  className,
}: {
  label: string;
  dragging: boolean;
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
        "group absolute top-0 z-10 flex h-full w-3 cursor-col-resize touch-none items-stretch justify-center outline-none",
        focusRing,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "w-px",
          dragging ? "bg-fg-subtle" : "bg-transparent group-hover:bg-border-hover",
          transition,
        )}
      />
    </div>
  );
}
