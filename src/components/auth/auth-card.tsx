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
    <div className={cn("relative isolate w-full max-w-sm lg:max-w-md", className)}>
      {/* The icon, decorative only: large, faint, clipped to this column so
          it never crosses under the card's own text. Real transparency (see
          the layout's own note) is why this is the icon, not the tiled
          motif sheet. `-z-10` keeps it behind everything, `aria-hidden`
          because it carries no information. Hidden at `lg:` -- the auth
          layout's own brand panel carries this watermark there instead, so
          this would just be a second, fainter copy. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset,
          no JS needed for a background flourish. */}
      <img
        src={withBasePath("/brand/mediast-icon.svg")}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-20 -z-10 size-72 opacity-[0.1] select-none lg:hidden"
      />

      <div className="mb-6 flex items-center gap-2 lg:hidden">
        <Wordmark className="h-7 w-auto" />
      </div>

      <div className="bg-surface-raised border-border rounded-card border p-6 shadow-card sm:p-7">
        <h1 className="text-heading-lg font-display text-fg-default">{title}</h1>
        {subtitle ? <p className="text-body text-fg-muted mt-1.5">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="text-body text-fg-muted mt-4 text-center">{footer}</div> : null}
    </div>
  );
}
