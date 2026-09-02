import { cn } from "@/lib/utils";

import { focusRingInset, transition } from "./styles";

/**
 * Table.
 *
 * Lists come before boards in this app, so the table is a primary surface
 * rather than a fallback. It is built to stay readable at sixty rows: rules
 * instead of stripes, a header that stays put while the body scrolls, and no
 * hover effect that moves anything.
 *
 * The wrapper scrolls horizontally on its own so a wide table never makes the
 * whole page scroll sideways.
 */

function TableContainer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "border-border rounded-card relative w-full overflow-x-auto border",
        className,
      )}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom border-collapse text-body", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        // Sticky so the column meanings survive a long scroll. The background
        // is opaque, or rows would show through it.
        "bg-surface-sunken sticky top-0 z-10",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-border border-b last:border-b-0",
        "hover:bg-surface-hover data-selected:bg-accent-subtle",
        transition,
        className,
      )}
      {...props}
    />
  );
}

/**
 * A row that navigates. It is a real row of cells with a link inside the first
 * one in practice; this variant just supplies the affordances.
 */
function TableRowLink({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <TableRow
      className={cn("cursor-pointer", focusRingInset, className)}
      tabIndex={0}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-label text-fg-muted border-border h-9 border-b px-3 text-left font-medium whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("text-fg-default px-3 py-2.5 align-middle", className)}
      {...props}
    />
  );
}

/** Right-aligned and tabular, so digits line up column-wise. */
function TableNumericCell({ className, ...props }: React.ComponentProps<"td">) {
  return <TableCell className={cn("text-right tabular-nums", className)} {...props} />;
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-caption text-fg-muted mt-3 text-left", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableNumericCell,
  TableRow,
  TableRowLink,
};
