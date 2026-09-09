"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { leaveChannelAction, requestToJoinChannelAction } from "@/lib/actions/channels";
import type { ChannelMembershipStatus } from "@/lib/data/channels";

/**
 * Request, wait, or leave -- one control, three states.
 *
 * Not a toggle switch: the label always names what pressing it will do (or,
 * for "Requested", that there is nothing left to press) -- so there is never
 * a moment where you have to work out whether the thing on screen is the
 * current state or the available action. A declined request reads exactly
 * like one never made: "Request to join" again, not a fourth label -- the
 * person on the outside cannot tell the difference, and does not need to.
 */
export function Membership({
  channelId,
  status,
}: {
  channelId: string;
  status: ChannelMembershipStatus;
}) {
  const t = useTranslations("Channels");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status === "pending") {
    return (
      <Button size="sm" variant="secondary" disabled>
        {t("requested")}
      </Button>
    );
  }

  const joined = status === "active";

  return (
    <Button
      size="sm"
      variant={joined ? "secondary" : "primary"}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await (joined ? leaveChannelAction(channelId) : requestToJoinChannelAction(channelId));
          router.refresh();
        })
      }
    >
      {joined ? t("leave") : t("requestToJoin")}
    </Button>
  );
}
