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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { requestLeave } from "@/lib/actions/leave";
import { workingDays } from "@/lib/leave-days";
import { cn } from "@/lib/utils";

/**
 * Asking for time off.
 *
 * A dialog rather than a page, and this is the one place in this app where
 * that is right: it is four fields, none of them long, and nobody is going to
 * lose twenty minutes of work if it closes. The project wizard and the meeting
 * form are pages because they are not.
 *
 * The cost in working days is shown as you pick the dates, computed by the
 * same function the server uses. A form that tells you afterwards that your
 * week off was really four days is a form you check twice.
 */

const TYPES = ["annual", "sick", "unpaid", "parental", "other"] as const;

export function RequestLeaveForm({ today }: { today: string }) {
  const t = useTranslations("Leave");
  const types = useTranslations("LeaveType");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]>("annual");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Half a day is only meaningful for a single-day request, so the control
  // disappears rather than sitting there doing nothing.
  const singleDay = startDate === endDate;
  const days = workingDays(startDate, endDate, singleDay && halfDay);

  const inputClass = cn(
    "h-9 w-full rounded-control border px-2.5 text-body",
    "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
    focusRing,
    transition,
  );

  function submit() {
    setError(null);

    startTransition(async () => {
      const result = await requestLeave({
        type,
        startDate,
        endDate,
        halfDay: singleDay && halfDay,
        reason: reason.trim() || undefined,
      });

      if (result.ok) {
        setOpen(false);
        setReason("");
        router.refresh();
        return;
      }

      const messages: Record<string, string> = {
        overlap: t("overlap"),
        noWorkingDays: t("noWorkingDays"),
        range: t("range"),
      };
      setError(messages[result.error] ?? t("invalid"));
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("request")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("requestTitle")}</DialogTitle>
            <DialogDescription>{t("requestBody")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field>
              <FieldLabel htmlFor="leave-type">{t("typeLabel")}</FieldLabel>
              <select
                id="leave-type"
                className={inputClass}
                value={type}
                onChange={(event) => setType(event.target.value as (typeof TYPES)[number])}
              >
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {types(value)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("fromLabel")}</FieldLabel>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    const next = event.target.value;
                    setStartDate(next);
                    // Dragging the start past the end is a mistake, not an
                    // instruction; the end follows rather than going invalid.
                    if (next > endDate) setEndDate(next);
                  }}
                  required
                />
              </Field>

              <Field>
                <FieldLabel>{t("toLabel")}</FieldLabel>
                <Input
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </Field>
            </div>

            {singleDay ? (
              <Field>
                <label className="text-label text-fg-default flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={halfDay}
                    onChange={(event) => setHalfDay(event.target.checked)}
                    className={cn("accent-accent size-4 rounded-[4px]", focusRing)}
                  />
                  {t("halfDayLabel")}
                </label>
                <FieldDescription>{t("halfDayHint")}</FieldDescription>
              </Field>
            ) : null}

            <Field>
              <FieldLabel>{t("reasonLabel")}</FieldLabel>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("reasonPlaceholder")}
                className="min-h-20"
              />
            </Field>

            {/*
              The cost, as you pick. Computed by the same function the server
              uses, so the number here and the number on the balance cannot
              disagree.
            */}
            <p
              className={cn("text-body", days > 0 ? "text-fg-default" : "text-fg-muted")}
              aria-live="polite"
            >
              {days > 0 ? t("costs", { days }) : t("costsNothing")}
            </p>

            {error ? (
              <p role="alert" className="text-body text-blocked-text">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose render={<Button type="button">{t("dismiss")}</Button>} />
              <Button type="submit" variant="primary" loading={pending} disabled={days <= 0}>
                {pending ? t("submitting") : t("submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
