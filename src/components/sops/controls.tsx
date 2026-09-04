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
import { addSop, confirmReviewed, moveSop, updateSteps } from "@/lib/actions/sops";
import { cn } from "@/lib/utils";

/**
 * Writing a procedure, and confirming one is still right.
 *
 * The review button is the important control on this screen and it is
 * deliberately the smallest possible interaction: one click, no dialog, no
 * confirmation. A six-month check that costs a form is a check nobody does,
 * and then every procedure in the library is permanently overdue.
 */

export type Option = { id: string; label: string };

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

function useErrorText() {
  const t = useTranslations("Sops");
  return (code: string) => {
    const known: Record<string, string> = {
      notFound: t("errorNotFound"),
      forbidden: t("errorForbidden"),
      alreadyThere: t("errorAlreadyThere"),
      noSteps: t("errorNoSteps"),
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

type DraftStep = { title: string; detail: string };

const emptyStep = (): DraftStep => ({ title: "", detail: "" });

/** The step editor, shared by the create dialog and the edit dialog. */
function StepFields({
  steps,
  setSteps,
}: {
  steps: DraftStep[];
  setSteps: React.Dispatch<React.SetStateAction<DraftStep[]>>;
}) {
  const t = useTranslations("Sops");

  const update = (index: number, patch: Partial<DraftStep>) =>
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  return (
    <fieldset className="border-border space-y-3 rounded-card border p-4">
      <legend className="text-label text-fg-default px-1 font-semibold">{t("steps")}</legend>

      {steps.map((step, index) => (
        <div key={index} className="space-y-2">
          <Input
            aria-label={`${t("stepTitle")} ${index + 1}`}
            value={step.title}
            onChange={(event) => update(index, { title: event.target.value })}
            placeholder={t("stepTitlePlaceholder")}
            maxLength={300}
          />
          <Input
            aria-label={`${t("stepDetail")} ${index + 1}`}
            value={step.detail}
            onChange={(event) => update(index, { detail: event.target.value })}
            placeholder={t("stepDetail")}
            maxLength={4000}
          />

          {steps.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
            >
              {t("removeStep", { number: index + 1 })}
            </Button>
          ) : null}
        </div>
      ))}

      {steps.length < 50 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setSteps((current) => [...current, emptyStep()])}
        >
          {t("addStep")}
        </Button>
      ) : null}
    </fieldset>
  );
}

export function NewSopDialog({ people, departments }: { people: Option[]; departments: Option[] }) {
  const t = useTranslations("Sops");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [steps, setSteps] = useState<DraftStep[]>([emptyStep()]);

  function onSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await addSop({
        title: String(formData.get("title") ?? ""),
        summary: String(formData.get("summary") ?? ""),
        departmentId: String(formData.get("departmentId") ?? ""),
        ownerUserId: String(formData.get("ownerUserId") ?? ""),
        reviewIntervalDays: String(formData.get("reviewIntervalDays") ?? "180"),
        steps: steps.map((step) => ({ title: step.title, detail: step.detail })),
      });

      // A successful create redirects, so anything returned is a refusal.
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
        {t("newSop")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("newSop")}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto">
            <Field>
              <FieldLabel htmlFor="title">{t("sopTitle")}</FieldLabel>
              <Input
                id="title"
                name="title"
                required
                maxLength={200}
                placeholder={t("sopTitlePlaceholder")}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="summary">{t("summary")}</FieldLabel>
              <Input
                id="summary"
                name="summary"
                maxLength={2000}
                placeholder={t("summaryPlaceholder")}
              />
            </Field>

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

            <Field>
              <FieldLabel htmlFor="reviewIntervalDays">{t("reviewInterval")}</FieldLabel>
              <Input
                id="reviewIntervalDays"
                name="reviewIntervalDays"
                type="number"
                min={1}
                max={1825}
                defaultValue={180}
              />
            </Field>

            <StepFields steps={steps} setSteps={setSteps} />

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

export function EditStepsDialog({
  sopId,
  initialSteps,
}: {
  sopId: string;
  initialSteps: Array<{ title: string; detail: string | null }>;
}) {
  const t = useTranslations("Sops");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [steps, setSteps] = useState<DraftStep[]>(
    initialSteps.length > 0
      ? initialSteps.map((step) => ({ title: step.title, detail: step.detail ?? "" }))
      : [emptyStep()],
  );

  function onSubmit() {
    setError(null);

    startTransition(async () => {
      const result = await updateSteps({ sopId, steps });
      if (!result.ok) setError(errorText(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("editSteps")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("editSteps")}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto">
            <StepFields steps={steps} setSteps={setSteps} />

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

/**
 * One click, no dialog.
 *
 * Secondary rather than primary: it is the most *useful* action on the page,
 * but red is for the one action a screen most wants and for destructive ones,
 * and a review is neither.
 */
export function MarkReviewedButton({ sopId, today }: { sopId: string; today: string }) {
  const t = useTranslations("Sops");
  const errorText = useErrorText();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await confirmReviewed(sopId, today);
            if (!result.ok) setError(errorText(result.error));
            else router.refresh();
          })
        }
      >
        {t("markReviewed")}
      </Button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

export function StatusButton({
  sopId,
  status,
}: {
  sopId: string;
  status: "draft" | "published" | "retired";
}) {
  const t = useTranslations("Sops");
  const errorText = useErrorText();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const next = status === "published" ? "retired" : status === "retired" ? "draft" : "published";
  const label =
    next === "published" ? t("publish") : next === "retired" ? t("retire") : t("restore");

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await moveSop({ sopId, status: next });
            if (!result.ok) setError(errorText(result.error));
            else router.refresh();
          })
        }
      >
        {label}
      </Button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
