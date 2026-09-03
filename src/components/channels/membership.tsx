"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { joinChannelAction, leaveChannelAction } from "@/lib/actions/channels";

/**
 * Join or leave, in one control.
 *
 * Not a toggle switch: the label always names what pressing it will do, so
 * there is never a moment where you have to work out whether the thing on
 * screen is the current state or the available action.
 */
export function Membership({ channelId, joined }: { channelId: string; joined: boolean }) {
  const t = useTranslations("Channels");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant={joined ? "secondary" : "primary"}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await (joined ? leaveChannelAction(channelId) : joinChannelAction(channelId));
          router.refresh();
        })
      }
    >
      {joined ? t("leave") : t("join")}
    </Button>
  );
}
