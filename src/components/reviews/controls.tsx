"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { publish, reopen, saveNotes, startReview } from "@/lib/actions/reviews";
import { cn } from "@/lib/utils";

/**
 * Writing up a review.
 *
 * An editor on the page rather than in a dialog, which is the exception to the
 * usual rule here -- and the reason is that this *is* the page. A review is a
 * document somebody types into while the meeting happens; putting it behind a
 * button would mean the screen you look at and the screen you write on are
 * different, which is exactly the friction that stops a ritual being kept.
 */

export type Option = { id: string; label: string };

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

const textareaClass = cn(
  "w-full rounded-control border px-2.5 py-2 text-body min-h-24",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

function useErrorText() {
  const t = useTranslations("Reviews");
  return (code: string) => {
    const known: Record<string, string> = {
      notFound: t("errorNotFound"),
      exists: t("errorExists"),
      weekNotOver: t("errorWeekNotOver"),
      published: t("errorPublished"),
      alreadyThere: t("errorAlreadyThere"),
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

export function StartReviewButton({
  weekStart,
  heldOn,
  today,
}: {
  weekStart: string;
  heldOn: string;
  today: string;
}) {
  const t = useTranslations("Reviews");
  const errorText = useErrorText();

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await startReview({ weekStart, heldOn, today });
            if (result && !result.ok) setError(errorText(result.error));
          })
        }
      >
        {t("startReview")}
      </Button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

type DraftDecision = { decision: string; ownerUserId: string; dueDate: string };

const emptyDecision = (): DraftDecision => ({ decision: "", ownerUserId: "", dueDate: "" });

export function ReviewEditor({
  reviewId,
  people,
  initial,
}: {
  reviewId: string;
  people: Option[];
  initial: {
    highlights: string | null;
    concerns: string | null;
    decisions: Array<{ decision: string; ownerUserId: string | null; dueDate: string | null }>;
  };
}) {
  const t = useTranslations("Reviews");
  const errorText = useErrorText();
  const router = useRouter();

  const [highlights, setHighlights] = useState(initial.highlights ?? "");
  const [concerns, setConcerns] = useState(initial.concerns ?? "");
  const [decisions, setDecisions] = useState<DraftDecision[]>(
    initial.decisions.length > 0
      ? initial.decisions.map((decision) => ({
          decision: decision.decision,
          ownerUserId: decision.ownerUserId ?? "",
          dueDate: decision.dueDate ?? "",
        }))
      : [emptyDecision()],
  );

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (index: number, patch: Partial<DraftDecision>) =>
    setDecisions((current) =>
      current.map((decision, i) => (i === index ? { ...decision, ...patch } : decision)),
    );

  function onSubmit() {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await saveNotes({
        reviewId,
        highlights,
        concerns,
        // An empty row is somebody who started typing and changed their mind,
        // not a decision to record.
        decisions: decisions.filter((decision) => decision.decision.trim() !== ""),
      });

      if (!result.ok) setError(errorText(result.error));
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <Field>
        <FieldLabel htmlFor="highlights">{t("highlights")}</FieldLabel>
        <textarea
          id="highlights"
          className={textareaClass}
          value={highlights}
          onChange={(event) => setHighlights(event.target.value)}
          placeholder={t("highlightsPlaceholder")}
          maxLength={4000}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="concerns">{t("concerns")}</FieldLabel>
        <textarea
          id="concerns"
          className={textareaClass}
          value={concerns}
          onChange={(event) => setConcerns(event.target.value)}
          placeholder={t("concernsPlaceholder")}
          maxLength={4000}
        />
      </Field>

      <fieldset className="border-border space-y-3 rounded-card border p-4">
        <legend className="text-label text-fg-default px-1 font-semibold">{t("decisions")}</legend>
        <p className="text-caption text-fg-muted">{t("decisionsBody")}</p>

        {decisions.map((decision, index) => (
          <div key={index} className="space-y-2">
            <Input
              aria-label={`${t("decision")} ${index + 1}`}
              value={decision.decision}
              onChange={(event) => update(index, { decision: event.target.value })}
              placeholder={t("decisionPlaceholder")}
              maxLength={1000}
            />

            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label={`${t("owner")} ${index + 1}`}
                className={selectClass}
                value={decision.ownerUserId}
                onChange={(event) => update(index, { ownerUserId: event.target.value })}
              >
                <option value="">{t("unassigned")}</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>

              <Input
                aria-label={`${t("by")} ${index + 1}`}
                type="date"
                value={decision.dueDate}
                onChange={(event) => update(index, { dueDate: event.target.value })}
              />
            </div>

            {decisions.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDecisions((current) => current.filter((_, i) => i !== index))}
              >
                {t("removeDecision", { number: index + 1 })}
              </Button>
            ) : null}
          </div>
        ))}

        {decisions.length < 30 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDecisions((current) => [...current, emptyDecision()])}
          >
            {t("addDecision")}
          </Button>
        ) : null}
      </fieldset>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {saved && !error ? (
        <p role="status" className="text-body text-fg-muted">
          {t("saved")}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="secondary" loading={pending}>
          {t("save")}
        </Button>
        <PublishButton reviewId={reviewId} />
      </div>
    </form>
  );
}

/**
 * Publishing freezes the numbers.
 *
 * Primary, because it is the one action this page most wants: an unpublished
 * review is a draft nobody else is reading.
 */
export function PublishButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations("Reviews");
  const errorText = useErrorText();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="primary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await publish(reviewId);
            if (!result.ok) setError(errorText(result.error));
            else router.refresh();
          })
        }
      >
        {t("publish")}
      </Button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

export function ReopenButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations("Reviews");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await reopen(reviewId);
          router.refresh();
        })
      }
    >
      {t("reopen")}
    </Button>
  );
}
