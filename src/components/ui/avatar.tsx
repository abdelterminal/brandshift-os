import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Avatar.
 *
 * The fallback is initials on a neutral ground, never a coloured one: a
 * per-person colour would be a fifth meaning for hue, and hue in this app is
 * spoken for.
 */

const avatarVariants = cva(
  "relative flex shrink-0 overflow-hidden rounded-pill select-none",
  {
    variants: {
      size: {
        xs: "size-5 text-caption",
        sm: "size-6 text-caption",
        md: "size-8 text-label",
        lg: "size-10 text-body",
        xl: "size-16 text-heading",
      },
    },
    defaultVariants: { size: "md" },
  },
);

function Avatar({
  className,
  size,
  ...props
}: AvatarPrimitive.Root.Props & VariantProps<typeof avatarVariants>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(avatarVariants({ size }), className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("size-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-surface-active text-fg-muted flex size-full items-center justify-center font-medium",
        className,
      )}
      {...props}
    />
  );
}

/** First letter of the first and last word. "Marc Dubois" -> "MD". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * The common case: a person, with initials standing in until their photo
 * loads or in place of one they never uploaded.
 */
function PersonAvatar({
  name,
  src,
  size,
  className,
}: {
  name: string;
  src?: string | null;
  size?: VariantProps<typeof avatarVariants>["size"];
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      {/* The name is on the row already, so the avatar itself is decorative. */}
      <AvatarFallback aria-hidden>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Overlapping avatars for a project team, with an overflow count.
 *
 * `md` by default: at `sm` the overlap eats into the second initial, which
 * makes a row of teammates unreadable at exactly the size it is meant for.
 */
function AvatarGroup({
  people,
  max = 4,
  size = "md",
  className,
}: {
  people: Array<{ name: string; src?: string | null }>;
  max?: number;
  size?: VariantProps<typeof avatarVariants>["size"];
  className?: string;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex -space-x-1.5">
        {shown.map((person) => (
          <PersonAvatar
            key={person.name}
            name={person.name}
            src={person.src}
            size={size}
            className="ring-surface-raised ring-2"
          />
        ))}
      </div>
      {overflow > 0 ? (
        <span className="text-caption text-fg-muted ml-2 tabular-nums">+{overflow}</span>
      ) : null}
      <span className="sr-only">{people.map((person) => person.name).join(", ")}</span>
    </div>
  );
}

export { Avatar, AvatarFallback, AvatarGroup, AvatarImage, PersonAvatar, initials };
