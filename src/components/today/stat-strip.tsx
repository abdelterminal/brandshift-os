import { Link } from "@/i18n/navigation";
import { focusRing, transition } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

const tileClassName = cn(
  "border-border bg-surface-raised hover:bg-surface-hover rounded-card block border p-4",
  focusRing,
  transition,
);

/**
 * A row of counts, each one a link to the place that count comes from --
 * navigation, not a vanity total. Every `value` here is already computed by
 * the caller from the same data the page renders below.
 *
 * `href` starting with "#" is a same-page anchor further down this same
 * screen, so it uses a plain `<a>` -- the locale-aware `Link` expects a real
 * pathname, matching how `layout.tsx`'s skip-link and `composer.tsx`'s
 * in-page jumps already handle this.
 */
export function StatStrip({
  items,
}: {
  items: { label: string; value: number; href: string; attention?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => {
        const value = (
          <div
            className={cn(
              "text-display font-display tabular-nums",
              item.attention && item.value > 0 ? "text-blocked-text" : "text-fg-default",
            )}
          >
            {item.value}
          </div>
        );
        return item.href.startsWith("#") ? (
          <a key={item.label} href={item.href} className={tileClassName}>
            {value}
            <div className="text-caption text-fg-muted mt-1">{item.label}</div>
          </a>
        ) : (
          <Link key={item.label} href={item.href} className={tileClassName}>
            {value}
            <div className="text-caption text-fg-muted mt-1">{item.label}</div>
          </Link>
        );
      })}
    </div>
  );
}
