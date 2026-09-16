import { Wordmark } from "@/components/brand/wordmark";
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
      <div className="mb-6 flex items-center justify-center">
        <Wordmark className="h-14 w-auto" />
      </div>

      <div className="bg-surface-raised/90 border-border/70 rounded-card border p-6 shadow-overlay backdrop-blur-md sm:p-7 dark:backdrop-blur-lg">
        <h1 className="text-display-lg font-display text-fg-default">{title}</h1>
        {subtitle ? <p className="text-body text-fg-muted mt-1.5">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="text-body text-fg-muted mt-4 text-center">{footer}</div> : null}
    </div>
  );
}
