"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { addCheckpoint, addObjective, finishObjective, undoClose } from "@/lib/actions/objectives";
import type { KeyResultUnit } from "@/lib/objectives";
import { cn } from "@/lib/utils";

/**
 * Setting a goal, and writing down what the number is.
 *
 * Dialogs rather than routed pages: each is one screen with no steps, and the
 * design rules put editing in a drawer or a dialog rather than a stack of
 * them. Nothing here opens a second dialog on top of the first.
 *
 * Every error the server can return has its own message. "Check the fields" on
 * a form carrying four key results and eight numbers is not help.
 */

export type Option = { id: string; label: string };

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

function useErrorText() {
  const t = useTranslations("Objectives");
  return (code: string) => {
    const known: Record<string, string> = {
      value: t("errorValue"),
      period: t("errorPeriod"),
      noKeyResults: t("errorNoKeyResults"),
      notFound: t("errorNotFound"),
      forbidden: t("errorForbidden"),
    };
    return known[code] ?? t("errorInvalid");
  };
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-body text-status-blocked-text">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// New objective
// ---------------------------------------------------------------------------

type DraftKeyResult = {
  title: string;
  unit: KeyResultUnit;
  direction: "increase" | "decrease";
  startValue: string;
  targetValue: string;
};

const emptyKeyResult = (): DraftKeyResult => ({
  title: "",
  unit: "count",
  direction: "increase",
  startValue: "",
  targetValue: "",
});

export function NewObjectiveDialog({
  people,
  departments,
  periodStart,
  periodEnd,
}: {
  people: Option[];
  departments: Option[];
  periodStart: string;
  periodEnd: string;
}) {
  const t = useTranslations("Objectives");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // One key result to begin with, because an objective with none cannot be
  // judged and this form should make that obvious rather than enforce it late.
  const [keyResults, setKeyResults] = useState<DraftKeyResult[]>([emptyKeyResult()]);

  const update = (index: number, patch: Partial<DraftKeyResult>) =>
    setKeyResults((current) => current.map((kr, i) => (i === index ? { ...kr, ...patch } : kr)));

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await addObjective({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        periodStart: String(formData.get("periodStart") ?? ""),
        periodEnd: String(formData.get("periodEnd") ?? ""),
        ownerUserId: String(formData.get("ownerUserId") ?? ""),
        departmentId: String(formData.get("departmentId") ?? ""),
        keyResults,
      });

      // A successful create redirects, so anything returned here is a refusal.
      if (result && !result.ok) setError(errorText(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("newObjective")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("newObjective")}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="title">{t("objectiveTitle")}</FieldLabel>
              <Input
                id="title"
                name="title"
                required
                maxLength={200}
                placeholder={t("objectiveTitlePlaceholder")}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
              <Input id="description" name="description" maxLength={4000} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="periodStart">{t("periodStart")}</FieldLabel>
                <Input
                  id="periodStart"
                  name="periodStart"
                  type="date"
                  required
                  defaultValue={periodStart}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="periodEnd">{t("periodEnd")}</FieldLabel>
                <Input
                  id="periodEnd"
                  name="periodEnd"
                  type="date"
                  required
                  defaultValue={periodEnd}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ownerUserId">{t("owner")}</FieldLabel>
                <select id="ownerUserId" name="ownerUserId" className={selectClass}>
                  <option value="">{t("unassigned")}</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="departmentId">{t("department")}</FieldLabel>
                <select id="departmentId" name="departmentId" className={selectClass}>
                  <option value="">{t("wholeCompany")}</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <fieldset className="border-border space-y-3 rounded-card border p-4">
              <legend className="text-label text-fg-default px-1 font-semibold">
                {t("keyResults")}
              </legend>

              {keyResults.map((kr, index) => (
                <div key={index} className="space-y-2">
                  <Input
                    aria-label={`${t("keyResultTitle")} ${index + 1}`}
                    value={kr.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                    placeholder={t("keyResultPlaceholder")}
                    maxLength={200}
                  />

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <select
                      aria-label={`${t("unit")} ${index + 1}`}
                      className={selectClass}
                      value={kr.unit}
                      onChange={(event) =>
                        update(index, { unit: event.target.value as KeyResultUnit })
                      }
                    >
                      <option value="count">{t("unitCount")}</option>
                      <option value="percent">{t("unitPercent")}</option>
                      <option value="currency">{t("unitCurrency")}</option>
                      <option value="days">{t("unitDays")}</option>
                    </select>

                    <select
                      aria-label={`${t("direction")} ${index + 1}`}
                      className={selectClass}
                      value={kr.direction}
                      onChange={(event) =>
                        update(index, {
                          direction: event.target.value as "increase" | "decrease",
                        })
                      }
                    >
                      <option value="increase">{t("directionIncrease")}</option>
                      <option value="decrease">{t("directionDecrease")}</option>
                    </select>

                    <Input
                      aria-label={`${t("startValue")} ${index + 1}`}
                      inputMode="decimal"
                      placeholder={t("startValue")}
                      value={kr.startValue}
                      onChange={(event) => update(index, { startValue: event.target.value })}
                    />
                    <Input
                      aria-label={`${t("targetValue")} ${index + 1}`}
                      inputMode="decimal"
                      placeholder={t("targetValue")}
                      value={kr.targetValue}
                      onChange={(event) => update(index, { targetValue: event.target.value })}
                    />
                  </div>

                  {keyResults.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setKeyResults((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      {t("removeKeyResult", { number: index + 1 })}
                    </Button>
                  ) : null}
                </div>
              ))}

              {keyResults.length < 10 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setKeyResults((current) => [...current, emptyKeyResult()])}
                >
                  {t("addKeyResult")}
                </Button>
              ) : null}
            </fieldset>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button type="submit" loading={pending}>
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Record a figure
// ---------------------------------------------------------------------------

export function RecordCheckpointDialog({
  keyResultId,
  keyResultTitle,
  today,
}: {
  keyResultId: string;
  keyResultTitle: string;
  today: string;
}) {
  const t = useTranslations("Objectives");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await addCheckpoint({
        keyResultId,
        value: String(formData.get("value") ?? ""),
        recordedOn: String(formData.get("recordedOn") ?? ""),
        note: String(formData.get("note") ?? ""),
      });

      if (!result.ok) setError(errorText(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("record")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("recordFor", { title: keyResultTitle })}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor={`value-${keyResultId}`}>{t("value")}</FieldLabel>
              <Input
                id={`value-${keyResultId}`}
                name="value"
                inputMode="decimal"
                required
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`recordedOn-${keyResultId}`}>{t("recordedOn")}</FieldLabel>
              <Input
                id={`recordedOn-${keyResultId}`}
                name="recordedOn"
                type="date"
                required
                defaultValue={today}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`note-${keyResultId}`}>{t("note")}</FieldLabel>
              <Input
                id={`note-${keyResultId}`}
                name="note"
                maxLength={2000}
                placeholder={t("notePlaceholder")}
              />
            </Field>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button type="submit" loading={pending}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Close, and undo closing
// ---------------------------------------------------------------------------

export function CloseObjectiveDialog({
  objectiveId,
  title,
}: {
  objectiveId: string;
  title: string;
}) {
  const t = useTranslations("Objectives");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await finishObjective({
        objectiveId,
        outcome: String(formData.get("outcome") ?? "") as "achieved",
        closingNote: String(formData.get("closingNote") ?? ""),
      });

      if (!result.ok) setError(errorText(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      {/*
        Secondary, not primary. Closing an objective is not the main thing
        anybody came to this page to do, and red is reserved for destructive
        actions -- which this is not, since it can be undone.
      */}
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("close")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("closeObjective", { title })}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor={`outcome-${objectiveId}`}>{t("outcome")}</FieldLabel>
              <select
                id={`outcome-${objectiveId}`}
                name="outcome"
                className={selectClass}
                defaultValue="achieved"
              >
                <option value="achieved">{t("outcomeAchieved")}</option>
                <option value="partly">{t("outcomePartly")}</option>
                <option value="missed">{t("outcomeMissed")}</option>
                <option value="abandoned">{t("outcomeAbandoned")}</option>
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor={`closingNote-${objectiveId}`}>{t("closingNote")}</FieldLabel>
              <Input
                id={`closingNote-${objectiveId}`}
                name="closingNote"
                maxLength={4000}
                placeholder={t("closingNotePlaceholder")}
              />
            </Field>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button type="submit" loading={pending}>
                {t("close")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReopenButton({ objectiveId }: { objectiveId: string }) {
  const t = useTranslations("Objectives");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await undoClose(objectiveId);
          router.refresh();
        })
      }
    >
      {t("reopen")}
    </Button>
  );
}
