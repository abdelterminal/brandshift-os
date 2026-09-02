import { cn } from "@/lib/utils";

/**
 * The three states every list, table and panel has to design for besides the
 * happy one: empty, loading, and failed.
 *
 * They live together because they are the same decision -- what does this
 * surface say when it has nothing to show -- and because keeping them in one
 * file makes it obvious when a screen has only built one of them.
 */

/**
 * Empty state.
 *
 * An empty list is an opportunity, not an error: it says what would be here
 * and offers the action that puts something here. "No data" alone leaves
 * someone stuck, which is the exact feeling this app exists to avoid.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** The thing to do next. An empty state without one is a dead end. */
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="text-fg-subtle [&_svg]:size-6" aria-hidden>
          {icon}
        </div>
      ) : null}
      <div className="max-w-sm">
        <p className="text-heading font-display text-fg-default">{title}</p>
        {description ? <p className="text-body text-fg-muted mt-1.5">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * Error state. Says what failed and offers a way forward -- never a stack
 * trace, and never a shrug.
 */
function ErrorState({
  title = "Something went wrong",
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      <div className="max-w-sm">
        <p className="text-heading font-display text-blocked-text">{title}</p>
        {description ? <p className="text-body text-fg-muted mt-1.5">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * Skeleton.
 *
 * Shaped like the content it stands in for, so the layout does not jump when
 * the real thing arrives. It pulses via opacity, which the reduced-motion rule
 * collapses along with everything else.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("bg-surface-active rounded-[6px] animate-pulse", className)}
      {...props}
    />
  );
}

/**
 * A skeleton shaped like table rows. `aria-busy` on the container tells a
 * screen reader that content is loading rather than that the table is empty.
 */
function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div data-slot="table-skeleton" aria-busy className={cn("divide-border divide-y", className)}>
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-3 px-3 py-3">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cn("h-4", column === 0 ? "flex-[2]" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export { EmptyState, ErrorState, Skeleton, TableSkeleton };
