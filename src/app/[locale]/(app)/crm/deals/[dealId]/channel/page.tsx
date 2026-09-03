import { notFound } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { ensureDealChannel } from "@/lib/data/channels";
import { getDeal } from "@/lib/data/crm";

/**
 * A deal's channel, reached by the deal.
 *
 * Exactly the arrangement `/work/<key>/channel` uses, for the same reason: the
 * channel may not exist yet, and the route that makes it is the route that
 * opens it. One home per channel -- a link followed from a deal and a link
 * pasted into a conversation are the same URL.
 */
export default async function DealChannelPage({
  params,
}: PageProps<"/[locale]/crm/deals/[dealId]/channel">) {
  const session = await requirePermission("crm.view");
  const { locale, dealId } = await params;

  const deal = await getDeal(session.actor, dealId);
  if (!deal) notFound();

  const channel = await ensureDealChannel(session.actor, {
    id: deal.id,
    title: deal.title,
    companyName: deal.companyName,
  });

  redirect({ href: `/channels/${channel.slug}`, locale });
}
