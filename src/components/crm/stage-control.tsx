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
import { moveDeal, saveCompanyNotes } from "@/lib/actions/crm";

/**
 * Moving a deal along, and recording why it stopped.
 *
 * The open stages are one press each, because moving from Proposal to
 * Negotiation is a fact somebody is reporting, not a decision needing a
 * confirmation. Losing one asks for a reason, because a pipeline with no
 * reasons on the lost deals teaches nobody anything once the quarter is over.
 */

export type Stage = "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

const OPEN: Stage[] = ["lead", "qualified", "proposal", "negotiation"];

export function StageControl({ dealId, current }: { dealId: string; current: Stage }) {
  const t = useTranslations("Crm");
  const stages = useTranslations("DealStage");
  const router = useRouter();
  const toast = useToast();

  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function move(stage: Stage, lostReason?: string) {
    startTransition(async () => {
      const result = await moveDeal({ dealId, stage, lostReason });

      if (!result.ok && result.error !== "alreadyThere") {
        toast.add({
          title: result.error === "reasonRequired" ? t("reasonRequired") : t("invalid"),
          data: { tone: "attention" },
        });
      }

      setLosing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("moveTo")} className="flex flex-wrap gap-2">
        {OPEN.map((stage) => (
          <Button
            key={stage}
            size="sm"
            aria-pressed={current === stage}
            variant={current === stage ? "primary" : "secondary"}
            loading={pending}
            onClick={() => move(stage)}
          >
            {stages(stage)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          aria-pressed={current === "won"}
          variant={current === "won" ? "primary" : "secondary"}
          loading={pending}
          onClick={() => move("won")}
        >
          {t("markWon")}
        </Button>
        <Button size="sm" aria-pressed={current === "lost"} onClick={() => setLosing(true)}>
          {t("markLost")}
        </Button>
      </div>

      <Dialog open={losing} onOpenChange={setLosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("lostTitle")}</DialogTitle>
            <DialogDescription>{t("lostBody")}</DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel>{t("lostReason")}</FieldLabel>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("lostReasonPlaceholder")}
              className="min-h-20"
            />
          </Field>

          <DialogFooter>
            <DialogClose render={<Button>{t("cancel")}</Button>} />
            <Button
              variant="destructive"
              loading={pending}
              disabled={reason.trim().length === 0}
              onClick={() => move("lost", reason.trim())}
            >
              {t("markLost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A company's running notes. The same shape as a meeting's write-up. */
export function CompanyNotes({ companyId, notes }: { companyId: string; notes: string | null }) {
  const t = useTranslations("Crm");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div>
        {notes ? (
          <p className="text-body text-fg-default whitespace-pre-wrap">{notes}</p>
        ) : (
          <p className="text-body text-fg-muted">{t("noNotes")}</p>
        )}
        <Button size="sm" className="mt-3" onClick={() => setEditing(true)}>
          {t("editNotes")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveCompanyNotes(companyId, draft);
          if (result.ok) {
            setEditing(false);
            router.refresh();
          }
        });
      }}
    >
      <Field>
        <FieldLabel>{t("notes")}</FieldLabel>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-32"
        />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" loading={pending}>
          {t("save")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setDraft(notes ?? "");
            setEditing(false);
          }}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
