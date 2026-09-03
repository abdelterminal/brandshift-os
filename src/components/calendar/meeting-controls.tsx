"use client";

import { Check, HelpCircle, X } from "lucide-react";
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
  cancelMeetingAction,
  rescheduleMeetingAction,
  respondToMeetingAction,
  saveMeetingNotesAction,
} from "@/lib/actions/meetings";
import { instantFromLocal } from "@/lib/calendar-dates";

/**
 * The things you do to a meeting once it exists.
 *
 * Answering is separate from managing it, because they are different people's
 * jobs: everyone invited answers, and only whoever called it can move or call
 * it off. Both live here so the meeting page stays a page and not a pile of
 * one-line client components.
 */

export type Response = "accepted" | "declined" | "tentative";

/**
 * Yes, no, maybe.
 *
 * Three buttons rather than a dropdown: the whole question is three options
 * long, and hiding two of them behind a click to save a row of space costs the
 * organizer the answers they actually need.
 */
export function RespondButtons({
  meetingId,
  current,
}: {
  meetingId: string;
  current: Response | "needs_action" | null;
}) {
  const t = useTranslations("Meeting");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const options = [
    { value: "accepted" as const, label: t("going"), Icon: Check },
    { value: "tentative" as const, label: t("maybe"), Icon: HelpCircle },
    { value: "declined" as const, label: t("notGoing"), Icon: X },
  ];

  return (
    <div role="group" aria-label={t("yourReply")} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const chosen = current === option.value;
        return (
          <Button
            key={option.value}
            size="sm"
            variant={chosen ? "primary" : "secondary"}
            aria-pressed={chosen}
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await respondToMeetingAction(meetingId, option.value);
                if (result.ok) {
                  toast.add({ title: t("responded", { response: option.label }) });
                  router.refresh();
                }
              })
            }
          >
            <option.Icon aria-hidden className="size-4" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

/** Moving it, and calling it off. Only offered to whoever may do them. */
export function OrganizerControls({
  meetingId,
  startsLocal,
  durationMinutes,
  timeZone,
}: {
  meetingId: string;
  startsLocal: string;
  durationMinutes: number;
  timeZone: string;
}) {
  const t = useTranslations("Meeting");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [starts, setStarts] = useState(startsLocal);
  const [minutes, setMinutes] = useState(durationMinutes);

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setMoving(true)}>
        {t("reschedule")}
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setCancelling(true)}>
        {t("cancel")}
      </Button>

      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rescheduleTitle")}</DialogTitle>
            <DialogDescription>{t("rescheduleBody")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel>{t("startsLabel")}</FieldLabel>
              <Input
                type="datetime-local"
                value={starts}
                onChange={(event) => setStarts(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t("durationLabel")}</FieldLabel>
              <Input
                type="number"
                min={15}
                max={720}
                step={15}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </Field>
          </div>

          <DialogFooter>
            <DialogClose render={<Button>{t("cancelEdit")}</Button>} />
            <Button
              variant="primary"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const startsAt = instantFromLocal(starts, timeZone);
                  if (!startsAt) return;

                  const result = await rescheduleMeetingAction({
                    meetingId,
                    startsAt: startsAt.toISOString(),
                    endsAt: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
                  });

                  if (result.ok) {
                    setMoving(false);
                    router.refresh();
                  }
                })
              }
            >
              {t("reschedule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelTitle")}</DialogTitle>
            <DialogDescription>{t("cancelBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button>{t("cancelEdit")}</Button>} />
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await cancelMeetingAction(meetingId);
                  if (result.ok) {
                    setCancelling(false);
                    toast.add({ title: t("cancelled") });
                    router.refresh();
                  }
                })
              }
            >
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * What was decided.
 *
 * Anyone who was there may write it. A meeting where only the organizer can
 * record the outcome is a meeting whose notes never get written -- and the
 * notes are the only reason a past meeting is worth keeping on the calendar.
 */
export function MeetingNotes({
  meetingId,
  notes,
  canWrite,
}: {
  meetingId: string;
  notes: string | null;
  canWrite: boolean;
}) {
  const t = useTranslations("Meeting");
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

        {canWrite ? (
          <Button size="sm" className="mt-3" onClick={() => setEditing(true)}>
            {t("editNotes")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveMeetingNotesAction(meetingId, draft);
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
          placeholder={t("notesPlaceholder")}
          className="min-h-32"
        />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" loading={pending}>
          {t("saveNotes")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setDraft(notes ?? "");
            setEditing(false);
          }}
        >
          {t("cancelEdit")}
        </Button>
      </div>
    </form>
  );
}
