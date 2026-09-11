import { transition } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

/**
 * "No tasks here yet" -- shown only to the person it is about, on their own
 * project or their own Today. Neutral while they are still inside the grace
 * period, amber once they are past it -- the same fact, a louder tone, never
 * a different screen. No dismiss: it goes away on its own the moment a task
 * of their own exists.
 *
 * Takes its text as props rather than translating itself, so it can be
 * rendered from a Server Component without a client boundary.
 *
 * On Today this sits inside a `group` link to the project; `group-hover:`
 * intensifies its own border rather than layering an unrelated background on
 * top of a card that already carries its own tone. On the project's own page
 * it renders with nothing to be a link to, so the same class is simply inert
 * there.
 */
export function UnplannedBanner({
  title,
  body,
  pastGrace,
}: {
  title: string;
  body: string;
  pastGrace: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-control border p-3",
        transition,
        pastGrace
          ? "bg-attention-bg border-attention-border"
          : "border-border group-hover:border-border-hover",
      )}
    >
      <p className={cn("text-body", pastGrace ? "text-attention-text" : "text-fg-default")}>
        {title}
      </p>
      <p className="text-caption text-fg-muted mt-1">{body}</p>
    </div>
  );
}
