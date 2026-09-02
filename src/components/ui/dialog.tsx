"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { focusRing, transition } from "./styles";

/**
 * Dialog.
 *
 * For confirmations and short, self-contained decisions -- nothing else.
 * Details and editing belong on a routed page or in a Drawer, and a dialog
 * must never open another dialog: the old app stacked them and people lost
 * track of what they were answering.
 *
 * The whole surface fades rather than flying in. Position is not animated, so
 * the dialog is where it will be from the first frame.
 */

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: DialogPrimitive.Popup.Props & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "bg-scrim fixed inset-0 z-50 min-h-dvh",
          "transition-opacity duration-[var(--duration-base)] ease-[var(--ease-out)]",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
        )}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-4",
          "bg-surface-overlay border-border rounded-surface border p-5 shadow-overlay",
          "outline-none",
          "transition-opacity duration-[var(--duration-base)] ease-[var(--ease-out)]",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(
              "text-fg-subtle hover:text-fg-default hover:bg-surface-hover absolute top-3.5 right-3.5",
              "inline-flex size-7 items-center justify-center rounded-[6px]",
              focusRing,
              transition,
            )}
          >
            <X aria-hidden className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1 pr-8", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-heading font-display text-fg-default", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-body text-fg-muted", className)}
      {...props}
    />
  );
}

/** Actions, end-aligned. The confirming action goes last, nearest the thumb. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
