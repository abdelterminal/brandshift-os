"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { focusRing, popupSurface, transition } from "./styles";

/**
 * Combobox -- a list long enough that typing beats scrolling.
 *
 * This is what the command palette, the assignee picker and the project picker
 * are built from. Filtering happens as you type; the list never has to be
 * memorised or scrolled past.
 */

const ComboboxRoot = ComboboxPrimitive.Root;
const ComboboxGroup = ComboboxPrimitive.Group;
const ComboboxCollection = ComboboxPrimitive.Collection;

function ComboboxInput({
  className,
  clearLabel = "Clear selection",
  openLabel = "Show options",
  ...props
}: ComboboxPrimitive.Input.Props & { clearLabel?: string; openLabel?: string }) {
  return (
    <ComboboxPrimitive.InputGroup
      className={cn(
        "flex h-9 w-full items-center rounded-control pr-1 pl-3",
        "bg-surface-raised border-border-control border",
        "hover:border-border-hover",
        "has-data-invalid:border-blocked-solid",
        // The group carries the ring, so the whole control lights up rather
        // than just the text box inside it.
        "has-focus-visible:outline-focus-ring has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
        "has-disabled:pointer-events-none has-disabled:opacity-55",
        transition,
        className,
      )}
    >
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        className={cn(
          "text-body text-fg-default placeholder:text-fg-subtle min-w-0 flex-1 bg-transparent outline-none",
        )}
        {...props}
      />
      <ComboboxPrimitive.Clear
        aria-label={clearLabel}
        className={cn(
          "text-fg-subtle hover:text-fg-default hover:bg-surface-hover inline-flex size-7 shrink-0 items-center justify-center rounded-[6px]",
          focusRing,
          transition,
        )}
      >
        <X aria-hidden className="size-4" />
      </ComboboxPrimitive.Clear>
      <ComboboxPrimitive.Trigger
        aria-label={openLabel}
        // Base UI otherwise wires this button's own `aria-labelledby` to the
        // field's label -- reasonable when there's no `openLabel`, but
        // `aria-labelledby` always wins over `aria-label` per the accessible
        // name computation, so it silently overrides the line above the
        // moment a field actually gives one. Passed explicitly rather than
        // omitted: an omitted prop leaves Base UI's own value in place,
        // where only an explicit `undefined` clears it in the merge that
        // combines this component's props with Base UI's internal ones.
        aria-labelledby={undefined}
        className={cn(
          "text-fg-subtle hover:text-fg-default hover:bg-surface-hover inline-flex size-7 shrink-0 items-center justify-center rounded-[6px]",
          focusRing,
          transition,
        )}
      >
        <ChevronDown aria-hidden className="size-4" />
      </ComboboxPrimitive.Trigger>
    </ComboboxPrimitive.InputGroup>
  );
}

function ComboboxContent({
  className,
  children,
  emptyMessage = "No matches",
  sideOffset = 4,
  ...props
}: ComboboxPrimitive.Popup.Props & { emptyMessage?: string; sideOffset?: number }) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner sideOffset={sideOffset} className="z-50">
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            popupSurface,
            "max-h-[min(24rem,var(--available-height))] w-[var(--anchor-width)] overflow-y-auto p-1",
            "transition-opacity duration-[var(--duration-fast)]",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          {/* An empty result is a state, not a blank box. */}
          <ComboboxPrimitive.Empty className="text-body text-fg-muted px-3 py-6 text-center">
            {emptyMessage}
          </ComboboxPrimitive.Empty>
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return <ComboboxPrimitive.List data-slot="combobox-list" className={cn(className)} {...props} />;
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-[6px] py-1.5 pr-2 pl-7 text-body",
        "text-fg-default select-none outline-none",
        "data-highlighted:bg-surface-hover",
        "data-disabled:pointer-events-none data-disabled:opacity-55",
        transition,
        className,
      )}
      {...props}
    >
      <ComboboxPrimitive.ItemIndicator className="text-accent-text absolute left-1.5 flex items-center">
        <Check aria-hidden className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroupLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn("text-caption text-fg-muted px-2 py-1.5", className)}
      {...props}
    />
  );
}

export {
  ComboboxRoot as Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
};
