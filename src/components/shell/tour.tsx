"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { completeTour } from "@/lib/actions/tour";
import { cn } from "@/lib/utils";

/**
 * The guided tour, shown once.
 *
 * The governing constraint of this whole app is that a user must never feel
 * lost, and until now the first thing a new person saw was a shell full of
 * words nobody had explained. This is the explanation: five steps, each
 * pointing at one real part of the frame.
 *
 * **It does not position itself next to anything.** A card that floats beside
 * its target needs measured coordinates written into a `style` attribute, and
 * inline styles are forbidden here -- the old app had 266 of them. So the card
 * sits in one fixed place and the *target* is what changes, marked with a data
 * attribute that `globals.css` turns into a ring. No measuring, no popper
 * dependency, nothing to recompute on scroll or resize, and it behaves the
 * same at 320px as at 1440.
 *
 * Motion is a fade on the card and a ring on the target -- opacity and colour,
 * the only two things the design rules allow, and both collapse to nothing
 * under `prefers-reduced-motion` via the global rule.
 */

/**
 * Each step names an element by `data-tour`, which the shell puts on the real
 * thing rather than on a copy. If a step's target is not on screen -- the rail
 * on a phone, say -- the step still reads correctly; it simply highlights
 * nothing, which is better than pointing at empty space.
 */
const STEPS = [
  { key: "rail", target: "rail" },
  { key: "today", target: "rail" },
  { key: "work", target: "rail" },
  { key: "palette", target: "palette" },
  { key: "account", target: "account" },
] as const;

export function Tour() {
  const t = useTranslations("Tour");

  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const dismiss = useCallback(() => {
    setOpen(false);
    // Not awaited: the card should go the moment it is dismissed, and a slow
    // write must not hold it on screen. Failing to record it means seeing the
    // tour once more, which is a smaller cost than a stuck overlay.
    void completeTour().catch(() => {});
  }, []);

  // Mark the target so the stylesheet can ring it. Cleared on every change so
  // two elements are never lit at once, and on unmount so nothing is left
  // ringed after the tour closes.
  useEffect(() => {
    if (!open) return;

    const element = document.querySelector(`[data-tour="${current.target}"]`);
    element?.setAttribute("data-tour-active", "");

    return () => element?.removeAttribute("data-tour-active");
  }, [current.target, open]);

  // Escape closes it, from anywhere. Somebody who wants this gone should not
  // have to find the button.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  // Move focus into the card when it appears, so a keyboard user is taken to
  // it rather than having to tab through the whole shell to reach it.
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      tabIndex={-1}
      className={cn(
        // Bottom-left on a phone where the rail is hidden anyway, and beside
        // the rail on a desktop so it never covers the thing it describes.
        // The rail is `w-56`; this clears it by a gutter so the card never
        // covers the thing the first three steps are describing.
        "fixed right-4 bottom-24 left-4 z-50 md:right-auto md:bottom-6 md:left-[calc(14rem+1.5rem)] md:max-w-sm",
        "border-border bg-surface-raised rounded-surface border p-4 shadow-card",
        "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
      )}
    >
      <p className="text-caption text-fg-muted mb-1 tabular-nums">
        {t("progress", { step: step + 1, total: STEPS.length })}
      </p>

      <h2 id="tour-title" className="text-heading font-display text-fg-default">
        {t(`${current.key}Title`)}
      </h2>
      <p className="text-body text-fg-muted mt-1.5">{t(`${current.key}Body`)}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={dismiss}>
          {t("skip")}
        </Button>

        <div className="flex items-center gap-2">
          {step > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setStep(step - 1)}>
              {t("back")}
            </Button>
          ) : null}

          <Button
            variant="primary"
            size="sm"
            onClick={() => (last ? dismiss() : setStep(step + 1))}
          >
            {last ? t("done") : t("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
