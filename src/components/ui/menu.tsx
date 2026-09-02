"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { popupSurface, transition } from "./styles";

/**
 * Menu -- a short list of actions hanging off a control.
 *
 * The avatar menu is built from this, and it is the only home for Profile and
 * Settings. Keeping them here and out of the rail is what stops the rail
 * growing past five destinations.
 */

const Menu = MenuPrimitive.Root;
const MenuTrigger = MenuPrimitive.Trigger;
const MenuGroup = MenuPrimitive.Group;
const MenuRadioGroup = MenuPrimitive.RadioGroup;

function MenuContent({
  className,
  children,
  sideOffset = 6,
  align = "end",
  ...props
}: MenuPrimitive.Popup.Props & {
  sideOffset?: number;
  align?: "start" | "center" | "end";
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={sideOffset} align={align} className="z-50">
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            popupSurface,
            "min-w-52 p-1 outline-none",
            "transition-opacity duration-[var(--duration-fast)]",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

const itemClassName = cn(
  "flex w-full cursor-default items-center gap-2 rounded-[6px] px-2 py-1.5 text-body",
  "text-fg-default select-none outline-none",
  "data-highlighted:bg-surface-hover",
  "data-disabled:pointer-events-none data-disabled:opacity-55",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle",
  transition,
);

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(itemClassName, className)}
      {...props}
    />
  );
}

/** A menu entry that navigates. Renders a real link, so it can be opened in a new tab. */
function MenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="menu-link-item"
      className={cn(itemClassName, className)}
      {...props}
    />
  );
}

function MenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      className={cn(itemClassName, "pl-7 relative", className)}
      {...props}
    >
      <MenuPrimitive.RadioItemIndicator className="text-accent-text absolute left-2 flex items-center">
        <Check aria-hidden className="size-4" />
      </MenuPrimitive.RadioItemIndicator>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function MenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-group-label"
      className={cn("text-caption text-fg-muted px-2 py-1.5", className)}
      {...props}
    />
  );
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

export {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
};
