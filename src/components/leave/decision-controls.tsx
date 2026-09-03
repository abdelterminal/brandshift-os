"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cancelLeave, decideLeave } from "@/lib/actions/leave";

/**
 * Answering a request, and withdrawing your own.
 *
 * Approving is one press: it is the common answer and making it two would
 * teach people to click through the second one without reading it. Declining
 * asks for a reason, because a no with no reason is a no that gets asked about
 * again in person.
 */

export function DecisionButtons({ id }: { id: string }) {
  const t = useTranslations("Leave");
  const router = useRouter();
  const toast = useToast();

  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "declined", withNote?: string) {
    startTransition(async () => {
      const result = await decideLeave({ id, decision, note: withNote });

      if (!result.ok) {
        // Somebody else got there first. Saying so beats a silent no-op.
        toast.add({
          title: result.error === "alreadyDecided" ? t("alreadyDecided") : t("invalid"),
          data: { tone: "attention" },
        });
      }

      setDeclining(false);
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {/*
        Both secondary, deliberately. Red is for the one action a screen most
        wants you to take, and a queue of ten requests would put ten of them on
        screen -- which is both over the 5% budget and a lie about which one
        matters. The page's primary action is asking for time off.

        Approving is also not more "primary" than declining: somebody has to
        actually decide, and the labels are what say which is which.
      */}
      <Button size="sm" loading={pending} onClick={() => decide("approved")}>
        {t("approve")}
      </Button>
      <Button size="sm" onClick={() => setDeclining(true)}>
        {t("decline")}
      </Button>

      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("declineTitle")}</DialogTitle>
            <DialogDescription>{t("declineBody")}</DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel>{t("declineNote")}</FieldLabel>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("declineNotePlaceholder")}
              className="min-h-20"
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button>{t("dismiss")}</Button>} />
            <Button
              variant="destructive"
              loading={pending}
              disabled={note.trim().length === 0}
              onClick={() => decide("declined", note.trim())}
            >
              {t("decline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Withdrawing your own, whether or not it has already been agreed. */
export function WithdrawButton({ id }: { id: string }) {
  const t = useTranslations("Leave");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size="sm" className="shrink-0" onClick={() => setConfirming(true)}>
        {t("cancelRequest")}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelTitle")}</DialogTitle>
            <DialogDescription>{t("cancelBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button>{t("dismiss")}</Button>} />
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  await cancelLeave(id);
                  setConfirming(false);
                  router.refresh();
                })
              }
            >
              {t("cancelRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
