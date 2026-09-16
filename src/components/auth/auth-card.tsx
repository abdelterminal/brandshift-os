import { Wordmark } from "@/components/brand/wordmark";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

/** The panel both auth screens sit in. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      {/* The motif, decorative only: large, faint, clipped to this column so
          it never crosses under the card's own text. `-z-10` keeps it behind
          everything, `aria-hidden` because it carries no information. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset,
          no JS needed for a background flourish. */}
      <img
        src={withBasePath("/brand/mediast-motif.svg")}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-32 -z-10 size-96 opacity-[0.06] select-none"
      />

      <div className="mb-6 flex items-center gap-2">
        <Wordmark className="h-7 w-auto" />
      </div>

      <div className="bg-surface-raised border-border rounded-card border p-6 shadow-card">
        <h1 className="text-heading-lg font-display text-fg-default">{title}</h1>
        {subtitle ? <p className="text-body text-fg-muted mt-1.5">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="text-body text-fg-muted mt-4 text-center">{footer}</div> : null}
    </div>
  );
}
