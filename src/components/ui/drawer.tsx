"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { focusRing, transition } from "./styles";

/**
 * Drawer -- a side panel that keeps the list behind it visible.
 *
 * This is where a task opens. Keeping the list in view is the whole point:
 * you can see the row you came from, act on the task, and close without ever
 * losing your place. A modal over the same list would hide the context that
 * makes the next decision obvious.
 *
 * The panel fades in place, following the shared opacity-and-colour motion rule.
 */

const Drawer = DrawerPrimitive.Root;
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;

function DrawerContent({
  className,
  children,
  showClose = true,
  ...props
}: DrawerPrimitive.Popup.Props & { showClose?: boolean }) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        className={cn(
          "bg-scrim fixed inset-0 z-50 min-h-dvh",
          "transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-out)]",
          "data-swiping:duration-0",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
        )}
      />
      <DrawerPrimitive.Viewport className="fixed inset-0 z-50 flex items-stretch justify-end">
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            "bg-surface-overlay border-border relative flex h-dvh max-h-dvh w-[min(30rem,100vw)] flex-col border-l shadow-overlay",
            "outline-none",
            "transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-out)]",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
          {showClose ? (
            <DrawerPrimitive.Close
              aria-label="Close"
              className={cn(
                "text-fg-subtle hover:text-fg-default hover:bg-surface-hover absolute top-3.5 right-3.5",
                "inline-flex size-7 items-center justify-center rounded-[6px]",
                focusRing,
                transition,
              )}
            >
              <X aria-hidden className="size-4" />
            </DrawerPrimitive.Close>
          ) : null}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("border-border flex flex-col gap-1 border-b px-5 py-4 pr-12", className)}
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-heading font-display text-fg-default", className)}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-body text-fg-muted", className)}
      {...props}
    />
  );
}

/** The scrolling middle. The header and footer stay put. */
function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4", className)}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "border-border flex flex-wrap items-center gap-2 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
};
