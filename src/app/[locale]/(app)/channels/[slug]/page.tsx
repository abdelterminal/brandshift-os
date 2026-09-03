import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Membership } from "@/components/channels/membership";
import { Conversation, type FeedItem } from "@/components/channels/conversation";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { getChannelBySlug, listChannels, readChannelFeed } from "@/lib/data/channels";
import { viewersOf } from "@/lib/realtime/presence";
import { focusRing, transition } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

/**
 * One channel.
 *
 * Anyone in the organization can read any channel; joining is what puts it on
 * your rail and gives you a read mark, which is what makes an unread badge
 * mean anything. Saying something joins you, because someone who has just
 * spoken in a room is in it. Leaving is one click away in the header, so it
 * stays a door rather than a trap.
 */

/** A held-open SSE connection and a cached page do not belong together. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/channels/[slug]">) {
  const session = await requirePermission("channel.view");
  const { slug } = await params;
  const channel = await getChannelBySlug(session.actor, slug);
  return { title: channel?.name ?? slug };
}

export default async function ChannelPage({ params }: PageProps<"/[locale]/channels/[slug]">) {
  const session = await requirePermission("channel.view");
  const { slug } = await params;

  const channel = await getChannelBySlug(session.actor, slug);
  if (!channel) notFound();

  const [t, feed, mine] = await Promise.all([
    getTranslations("Channels"),
    readChannelFeed(session.actor, channel),
    listChannels(session.actor),
  ]);

  // Opening a channel does not put you in it: if it did, Leave would undo
  // itself on the very next render. Joining is deliberate -- pressing Join, or
  // saying something, which is the same intent expressed faster.
  const joined = mine.find((row) => row.id === channel.id)?.joined ?? false;

  const items: FeedItem[] = feed.map((entry) =>
    entry.kind === "message"
      ? {
          kind: "message",
          id: entry.id,
          at: entry.at.toISOString(),
          authorUserId: entry.authorUserId,
          authorName: entry.authorName,
          avatarUrl: entry.avatarUrl,
          body: entry.body,
          editedAt: entry.editedAt?.toISOString() ?? null,
          deletedAt: entry.deletedAt?.toISOString() ?? null,
        }
      : {
          kind: "event",
          id: entry.id,
          at: entry.at.toISOString(),
          verb: entry.verb,
          actorName: entry.actorName,
          metadata: entry.metadata,
        },
  );

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-5 py-8 sm:px-8">
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display font-display text-fg-default">{channel.name}</h1>
            {channel.projectKey ? (
              // Labelled by where it goes, not by the project's name. A project
              // channel is named after its project, so repeating the name under
              // the heading says the same thing twice and tells you nothing
              // about what the link does.
              <p className="text-caption text-fg-muted mt-1">
                <Link
                  href={`/work/${channel.projectKey}`}
                  // Underlined, not red. Red means primary action, active nav,
                  // destructive or blocked, and a link to somewhere else is
                  // none of those -- spending the 5% budget on it would make
                  // every one of those four mean slightly less.
                  className={cn(
                    "text-fg-default hover:text-fg-default rounded-[6px] font-medium underline underline-offset-2",
                    focusRing,
                    transition,
                  )}
                >
                  {t("openProject", { key: channel.projectKey })}
                </Link>
              </p>
            ) : channel.description ? (
              <p className="text-body text-fg-muted mt-1.5">{channel.description}</p>
            ) : null}
          </div>

          <Membership channelId={channel.id} joined={joined} />
        </div>
      </header>

      <Conversation
        channelId={channel.id}
        currentUserId={session.actor.userId}
        items={items}
        // Rendered on the server so the roster is right on first paint, then
        // kept current by the stream. Without it the row appears a beat late
        // and reads as "nobody is here" for as long as that takes.
        initialViewers={viewersOf(session.actor.organizationId, channel.id)}
        canPost={can(session.actor, "channel.post")}
      />
    </div>
  );
}
