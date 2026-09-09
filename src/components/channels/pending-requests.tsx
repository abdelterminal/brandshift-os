"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { approveJoinRequestAction, declineJoinRequestAction } from "@/lib/actions/channels";

export type PendingRequest = { userId: string; name: string; avatarUrl: string | null };

/**
 * Who's waiting, and the only two answers there are.
 *
 * On the channel itself rather than a separate screen -- the same choice
 * leave approval already made: the decision and the thing it's about live in
 * the same place, not a queue somewhere else that has to be cross-referenced
 * back to it.
 */
export function PendingRequests({
  channelId,
  requests,
}: {
  channelId: string;
  requests: PendingRequest[];
}) {
  const t = useTranslations("Channels");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function respond(userId: string, approve: boolean) {
    startTransition(async () => {
      await (approve
        ? approveJoinRequestAction(channelId, userId)
        : declineJoinRequestAction(channelId, userId));
      router.refresh();
    });
  }

  return (
    <div className="border-border bg-surface-raised mb-5 rounded-card border p-3">
      <p className="text-label text-fg-default mb-2">
        {t("pendingRequests", { count: requests.length })}
      </p>
      <ul className="flex flex-col gap-2">
        {requests.map((request) => (
          <li key={request.userId} className="flex items-center gap-2.5">
            <PersonAvatar name={request.name} src={request.avatarUrl} size="sm" />
            <span className="text-body text-fg-default min-w-0 flex-1 truncate">
              {request.name}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => respond(request.userId, false)}
            >
              {t("decline")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={pending}
              onClick={() => respond(request.userId, true)}
            >
              {t("approve")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
