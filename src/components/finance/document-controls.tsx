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
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  addPayment,
  cancelInvoice,
  issueInvoice,
  moveQuote,
  reimburseExpense,
} from "@/lib/actions/finance";

/**
 * What you do to a document once it exists.
 *
 * Sending is one press. Declining a quote and voiding an invoice both ask for
 * a reason, for the same reason the pipeline does: a refusal nobody wrote down
 * teaches nobody anything, and a voided invoice with no explanation is the one
 * an auditor asks about.
 */

export function QuoteControls({
  quoteId,
  status,
}: {
  quoteId: string;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
}) {
  const t = useTranslations("Finance");
  const router = useRouter();
  const toast = useToast();

  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function move(next: "sent" | "accepted" | "declined", declineReason?: string) {
    startTransition(async () => {
      const result = await moveQuote({ quoteId, status: next, declineReason });
      if (!result.ok) {
        toast.add({ title: t("invalid"), data: { tone: "attention" } });
      }
      setDeclining(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" ? (
        <Button size="sm" variant="primary" loading={pending} onClick={() => move("sent")}>
          {t("send")}
        </Button>
      ) : null}

      {status === "sent" ? (
        <>
          <Button size="sm" loading={pending} onClick={() => move("accepted")}>
            {t("markAccepted")}
          </Button>
          <Button size="sm" onClick={() => setDeclining(true)}>
            {t("markDeclined")}
          </Button>
        </>
      ) : null}

      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("declinedTitle")}</DialogTitle>
            <DialogDescription>{t("declinedBody")}</DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel>{t("declineReason")}</FieldLabel>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-20"
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button>{t("cancel")}</Button>} />
            <Button
              variant="destructive"
              loading={pending}
              disabled={reason.trim().length === 0}
              onClick={() => move("declined", reason.trim())}
            >
              {t("markDeclined")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function InvoiceControls({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: "draft" | "sent" | "part_paid" | "paid" | "void";
}) {
  const t = useTranslations("Finance");
  const router = useRouter();
  const toast = useToast();

  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const open = status === "sent" || status === "part_paid";

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" ? (
        <Button
          size="sm"
          variant="primary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await issueInvoice(invoiceId);
              if (!result.ok) toast.add({ title: t("alreadySent"), data: { tone: "attention" } });
              router.refresh();
            })
          }
        >
          {t("send")}
        </Button>
      ) : null}

      {open ? (
        <Button size="sm" variant="primary" onClick={() => setPaying(true)}>
          {t("recordPayment")}
        </Button>
      ) : null}

      {status !== "void" ? (
        <Button size="sm" onClick={() => setVoiding(true)}>
          {t("voidIt")}
        </Button>
      ) : null}

      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("paymentTitle")}</DialogTitle>
            <DialogDescription>{t("paymentBody")}</DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel>{t("amount")}</FieldLabel>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button>{t("cancel")}</Button>} />
            <Button
              variant="primary"
              loading={pending}
              disabled={amount.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await addPayment({ invoiceId, amount });
                  if (!result.ok) {
                    toast.add({
                      title: result.error === "money" ? t("money") : t("notSent"),
                      data: { tone: "attention" },
                    });
                    return;
                  }
                  setPaying(false);
                  setAmount("");
                  router.refresh();
                })
              }
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voiding} onOpenChange={setVoiding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("voidTitle")}</DialogTitle>
            <DialogDescription>{t("voidBody")}</DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel>{t("voidReason")}</FieldLabel>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-20"
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button>{t("cancel")}</Button>} />
            <Button
              variant="destructive"
              loading={pending}
              disabled={reason.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  await cancelInvoice({ invoiceId, reason: reason.trim() });
                  setVoiding(false);
                  router.refresh();
                })
              }
            >
              {t("voidIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ReimburseButton({ expenseId }: { expenseId: string }) {
  const t = useTranslations("Finance");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      className="shrink-0"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await reimburseExpense(expenseId);
          router.refresh();
        })
      }
    >
      {t("reimburse")}
    </Button>
  );
}
