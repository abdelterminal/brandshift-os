"use client";

import { cn } from "@/lib/utils";

import { focusRing, transition } from "./styles";

/**
 * The draggable divider between two resizable panes -- a queue column, a
 * table header. A thin line at rest, a wider invisible hit target around it
 * (dragging a 1px line with a mouse is not realistic), and no colour beyond
 * the existing border ramp: a resize handle is not one of the four things
 * the brand accent is allowed to mean, dragging or not.
 *
 * Keyboard-operable too -- `role="separator"` plus arrow keys, the
 * "window splitter" pattern -- so resizing is not mouse-only. A focusable
 * separator is a window-splitter widget as far as ARIA is concerned, which
 * makes `aria-valuenow` (and the min/max either side of it) required, not
 * optional -- axe fails the build on a `role="separator"` missing it.
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
          dragging ? "bg-fg-subtle" : "bg-border group-hover:bg-border-hover",
          transition,
        )}
      />
    </div>
  );
}
