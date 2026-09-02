"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { disabled, focusRing, popupSurface, transition } from "./styles";

/**
 * Select -- a fixed list of options.
 *
 * Use this when the choices are known and few. Once the list is long enough
 * that someone would rather type than scroll, use Combobox instead.
 */

const SelectRoot = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-control px-3 text-body",
        "bg-surface-raised text-fg-default border-border-control border",
        "hover:border-border-hover",
        "data-invalid:border-blocked-solid",
        // Open is a state the eye should be able to read at a glance.
        "data-popup-open:border-border-hover data-popup-open:bg-surface-hover",
        focusRing,
        disabled,
        transition,
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-fg-subtle">
        <ChevronsUpDown aria-hidden className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("truncate text-left data-placeholder:text-fg-subtle", className)}
      {...props}
    />
  );
}

function SelectContent({
  className,
  children,
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props & { sideOffset?: number }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={sideOffset} className="z-50">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            popupSurface,
            "max-h-[min(24rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto p-1",
            // Opacity only, so the list does not fly in from anywhere.
            "origin-[var(--transform-origin)] transition-opacity duration-[var(--duration-fast)]",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-[6px] py-1.5 pr-2 pl-7 text-body",
        "text-fg-default relative select-none outline-none",
        // Base UI moves `data-highlighted` with both pointer and keyboard, so
        // one rule covers hover and arrow-key navigation.
        "data-highlighted:bg-surface-hover",
        "data-disabled:pointer-events-none data-disabled:opacity-55",
        transition,
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="text-accent-text absolute left-1.5 flex items-center">
        <Check aria-hidden className="size-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="truncate">{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectGroupLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn("text-caption text-fg-muted px-2 py-1.5", className)}
      {...props}
    />
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

export {
  SelectRoot as Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
