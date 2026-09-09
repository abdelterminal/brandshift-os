import { getTranslations } from "next-intl/server";

import { Badge, CountBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listChannels, type ChannelListRow } from "@/lib/data/channels";
import { cn } from "@/lib/utils";

/**
 * Every channel, and which ones are yours.
 *
 * The rail nests the ones you are in, which is the fast path. This page is the
 * slow one: it is how you find a channel you are not in yet, and it is the
 * whole list on a phone, where there is no rail to nest anything under.
 */
export default async function ChannelsPage() {
  const session = await requirePermission("channel.view");

  const [t, rows] = await Promise.all([getTranslations("Channels"), listChannels(session.actor)]);

  const mine = rows.filter((row) => row.joined);
  const rest = rows.filter((row) => !row.joined);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
      </header>

      {rows.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("noneTitle")} description={t("noneBody")} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <ChannelSection heading={t("yours")} rows={mine} emptyLabel={t("noneJoined")} requestedLabel={t("requested")} />
          {rest.length > 0 ? (
            <ChannelSection heading={t("browse")} rows={rest} requestedLabel={t("requested")} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ChannelSection({
  heading,
  rows,
  emptyLabel,
  requestedLabel,
}: {
  heading: string;
  rows: ChannelListRow[];
  emptyLabel?: string;
  requestedLabel: string;
}) {
  if (rows.length === 0 && !emptyLabel) return null;

  return (
    <section>
      <h2 className="text-label text-fg-default mb-2">{heading}</h2>

      {rows.length === 0 ? (
        <p className="text-body text-fg-muted">{emptyLabel}</p>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/channels/${row.slug}`}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3",
                  "hover:bg-surface-hover",
                  focusRingInset,
                  transition,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-body text-fg-default block font-medium">{row.name}</span>
                  {/*
                    Joined from the parts that exist. Interpolating a separator
                    unconditionally left every project channel reading "NOR ·"
                    with nothing after it, which looks like something failed to
                    load rather than like a channel with no description.
                  */}
                  <span className="text-caption text-fg-subtle mt-0.5 block truncate">
                    {[row.projectKey, row.description].filter(Boolean).join(" · ")}
                  </span>
                </span>

                {row.status === "pending" ? (
                  <Badge tone="attention" size="sm" className="shrink-0">
                    {requestedLabel}
                  </Badge>
                ) : row.unread > 0 ? (
                  <CountBadge tone="accent" className="shrink-0">
                    {row.unread}
                  </CountBadge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
