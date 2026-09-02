"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

import { focusRing, transition } from "./styles";

/**
 * Tabs.
 *
 * Person and project detail are routed pages with tabs -- Overview, Work,
 * Activity -- not modals. Each tab should be linkable, so in those screens the
 * active tab comes from the URL rather than from local state.
 *
 * The active tab is marked by an underline in the brand red plus a weight
 * change, so it is never colour alone.
 */

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("border-border relative flex items-center gap-1 border-b", className)}
      {...props}
    >
      {props.children}
      {/* Base UI drives the indicator's position from the active tab. */}
      <TabsPrimitive.Indicator
        className={cn(
          "bg-brand absolute bottom-0 left-0 h-0.5 w-[var(--active-tab-width)]",
          "translate-x-[var(--active-tab-left)]",
          "transition-[translate,width] duration-[var(--duration-base)] ease-[var(--ease-out)]",
        )}
      />
    </TabsPrimitive.List>
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "text-label text-fg-muted relative -mb-px rounded-t-[6px] px-3 py-2.5 whitespace-nowrap",
        "hover:text-fg-default hover:bg-surface-hover",
        "data-selected:text-fg-default data-selected:font-semibold",
        "data-disabled:pointer-events-none data-disabled:opacity-55",
        focusRing,
        transition,
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("pt-4 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsPanel, TabsTab };
