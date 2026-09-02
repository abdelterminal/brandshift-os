"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { AlertTriangle, Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { focusRing, transition } from "./styles";

/**
 * Toast -- confirmation that something happened, and the chance to undo it.
 *
 * Reserved for the result of an action the person took. It is not a place to
 * report state they did not cause; that belongs on the screen itself. Anything
 * carrying an Undo should stay long enough to actually be undone.
 *
 * Base UI's viewport already handles focus and hover-to-pause, so a toast
 * cannot vanish out from under someone reading it.
 */

type ToastTone = "neutral" | "success" | "warning" | "error";

const TONE_ICON: Record<ToastTone, React.ComponentType<{ className?: string }> | null> = {
  neutral: null,
  success: Check,
  warning: AlertTriangle,
  error: AlertTriangle,
};

const TONE_ICON_CLASS: Record<ToastTone, string> = {
  neutral: "text-fg-muted",
  success: "text-complete-solid",
  warning: "text-attention-solid",
  error: "text-blocked-solid",
};

const ToastProvider = ToastPrimitive.Provider;

/** Bottom-right on desktop, full width above the mobile nav on small screens. */
function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        className={cn(
          "fixed right-4 bottom-4 left-4 z-100 flex flex-col gap-2",
          "sm:left-auto sm:w-90",
          className,
        )}
        {...props}
      >
        <ToastList />
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toast) => {
    const tone = (toast.data as { tone?: ToastTone } | undefined)?.tone ?? "neutral";
    const Icon = TONE_ICON[tone];

    return (
      <ToastPrimitive.Root
        key={toast.id}
        toast={toast}
        data-slot="toast"
        className={cn(
          "bg-surface-overlay border-border rounded-card border p-3 shadow-overlay",
          "transition-opacity duration-[var(--duration-base)] ease-[var(--ease-out)]",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
        )}
      >
        <ToastPrimitive.Content className="flex items-start gap-3">
          {Icon ? (
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", TONE_ICON_CLASS[tone])} />
          ) : null}

          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="text-label text-fg-default" />
            <ToastPrimitive.Description className="text-body text-fg-muted mt-0.5" />
          </div>

          {toast.actionProps ? (
            <ToastPrimitive.Action
              className={cn(
                "text-label text-accent-text hover:bg-accent-subtle shrink-0 rounded-[6px] px-2 py-1",
                focusRing,
                transition,
              )}
            />
          ) : null}

          <ToastPrimitive.Close
            aria-label="Dismiss"
            className={cn(
              "text-fg-subtle hover:text-fg-default hover:bg-surface-hover -mt-0.5 -mr-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-[6px]",
              focusRing,
              transition,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Content>
      </ToastPrimitive.Root>
    );
  });
}

/**
 * `const toast = useToast()`, then
 * `toast.add({ title: "Task completed", data: { tone: "success" } })`.
 */
const useToast = ToastPrimitive.useToastManager;

export { ToastProvider, ToastViewport, useToast, type ToastTone };
