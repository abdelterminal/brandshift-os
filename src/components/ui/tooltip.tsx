"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

/**
 * Tooltip.
 *
 * A hint for sighted users, never the only place information lives. An
 * icon-only button still needs its own accessible name -- the tooltip is not
 * a substitute for one, and it is unreachable by touch.
 *
 * Never put an action inside one.
 */

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: TooltipPrimitive.Popup.Props & { sideOffset?: number }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner sideOffset={sideOffset} className="z-100">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            // Inverted against the page, the way a tooltip has always read.
            "bg-fg-default text-surface-raised rounded-[6px] px-2 py-1 text-caption shadow-popover",
            "max-w-64 select-none",
            "transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-out)]",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

/**
 * The common case: wrap a control, give it a hint.
 *
 * Timing lives on `TooltipProvider` (`delay` / `closeDelay`), not here, so the
 * whole app opens tooltips at one speed instead of each caller picking a
 * number.
 */
function SimpleTooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

export { SimpleTooltip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
