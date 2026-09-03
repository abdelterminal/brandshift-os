import { notFound } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { ensureProjectChannel } from "@/lib/data/channels";
import { getProjectByKey } from "@/lib/data/projects";

/**
 * A project's channel, reached by the project's own key.
 *
 * `/work/MER/channel` is a link the project page can always offer, whether or
 * not a channel exists yet -- which matters because every project created
 * before channels did has none. This makes one on first visit, puts the
 * project's people in it, and forwards to the channel's real home.
 *
 * One home per channel: everything lives at `/channels/<slug>`, so a link
 * pasted into a conversation and a link followed from a project are the same
 * URL, rather than two pages that have to be kept in step.
 */
export default async function ProjectChannelPage({
  params,
}: PageProps<"/[locale]/work/[key]/channel">) {
  const session = await requirePermission("channel.view");
  const { locale, key } = await params;

  const project = await getProjectByKey(session.actor, key);
  if (!project) notFound();

  // The slug comes back from the write rather than being derived again here:
  // `ensureProjectChannel` resolves name collisions, so what it stored is the
  // only slug that is right.
  const channel = await ensureProjectChannel(session.actor, project);

  redirect({ href: `/channels/${channel.slug}`, locale });
}
