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
    <div className={cn("w-full max-w-sm", className)}>
      <div className="mb-6 flex items-center gap-2">
        <span className="bg-brand size-6 shrink-0 rounded-[6px]" aria-hidden />
        <span className="text-label text-fg-default font-semibold">BrandShift OS</span>
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
