import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Membership } from "@/components/channels/membership";
import { PendingRequests } from "@/components/channels/pending-requests";
import { Conversation, type FeedItem } from "@/components/channels/conversation";
import { EmptyState } from "@/components/ui/feedback";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import {
  getChannelBySlug,
  listChannels,
  listPendingRequests,
  readChannelFeed,
} from "@/lib/data/channels";
import { viewersOf } from "@/lib/realtime/presence";
import { focusRing, transition } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

/**
 * One channel.
 *
 * Being on the project or deal it belongs to is what earns you a seat here;
 * anyone else has to ask, and an admin, owner, or this channel's own creator
 * has to say yes before the feed opens. The membership control stays visible
 * either way, so asking (or leaving) is always one click from here -- what
 * changes with your standing is only whether the conversation underneath it
 * is showing.
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

  const [t, mine] = await Promise.all([
    getTranslations("Channels"),
    listChannels(session.actor),
  ]);

  // Opening a channel no longer puts you in it -- that used to double as the
  // "did I mean to join" question this control already asks; asking is now
  // deliberate every time, either the button here or a decision someone else
  // makes on your request.
  const status = mine.find((row) => row.id === channel.id)?.status ?? "none";
  const active = status === "active";

  const canManage = can(session.actor, "channel.manageMembers", {
    ownerUserId: channel.createdByUserId,
  });

  const [feed, pendingRequests] = await Promise.all([
    // Nothing to read until you're actually in -- fetching a feed nobody may
    // see would be a query that exists only to be thrown away.
    active ? readChannelFeed(session.actor, channel) : Promise.resolve([]),
    canManage ? listPendingRequests(session.actor, channel.id) : Promise.resolve([]),
  ]);

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

          <Membership channelId={channel.id} status={status} />
        </div>
      </header>

      {pendingRequests.length > 0 ? (
        <PendingRequests channelId={channel.id} requests={pendingRequests} />
      ) : null}

      {active ? (
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
      ) : (
        <div className="border-border rounded-card border">
          <EmptyState
            title={status === "pending" ? t("noAccessPendingTitle") : t("noAccessTitle")}
            description={status === "pending" ? t("noAccessPendingBody") : t("noAccessBody")}
          />
        </div>
      )}
    </div>
  );
}
