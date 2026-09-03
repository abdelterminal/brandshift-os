"use client";

import { Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import { lineTotal, parseMoney, parseQuantity, totalsFor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The lines of a quote or an invoice.
 *
 * The running total is computed here by the same functions the server uses --
 * `src/lib/money.ts`, in integer cents, per line, tax added line by line. A
 * form that shows one total and stores another is worse than a form that shows
 * none, and the only way to be sure is to run the same code.
 *
 * A line whose figures are not yet valid contributes nothing rather than
 * guessing at zero, and the total says so by not moving.
 */

export type DraftLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateBasisPoints: number;
};

/** The rates an agency in France actually charges. */
const TAX_RATES = [0, 550, 1000, 2000] as const;

export const EMPTY_LINE: DraftLine = {
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRateBasisPoints: 2000,
};

export function useLines(initial: DraftLine[] = [EMPTY_LINE]) {
  const [lines, setLines] = useState<DraftLine[]>(initial);
  return { lines, setLines };
}

export function LineEditor({
  lines,
  setLines,
  currency,
}: {
  lines: DraftLine[];
  setLines: (next: DraftLine[]) => void;
  currency: string;
}) {
  const t = useTranslations("Finance");
  const format = useFormatter();

  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency });

  /** Only the lines that are actually complete count towards the total. */
  const parsed = lines.flatMap((line) => {
    const quantityThousandths = parseQuantity(line.quantity);
    const unitPrice = parseMoney(line.unitPrice);
    if (quantityThousandths === null || unitPrice === null) return [];
    return [{ quantityThousandths, unitPrice, taxRateBasisPoints: line.taxRateBasisPoints }];
  });

  const totals = totalsFor(parsed);

  const update = (index: number, patch: Partial<DraftLine>) =>
    setLines(lines.map((line, at) => (at === index ? { ...line, ...patch } : line)));

  const inputClass = cn(
    "h-9 w-full rounded-control border px-2.5 text-body",
    "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
    focusRing,
    transition,
  );

  return (
    <div>
      <p className="text-label text-fg-default mb-2 font-medium" id="lines-label">
        {t("lines")}
      </p>

      <ul aria-labelledby="lines-label" className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const quantityThousandths = parseQuantity(line.quantity);
          const unitPrice = parseMoney(line.unitPrice);
          const complete = quantityThousandths !== null && unitPrice !== null;

          return (
            <li
              key={index}
              className="border-border bg-surface-sunken flex flex-col gap-2 rounded-card border p-3"
            >
              <input
                aria-label={`${t("description")} ${index + 1}`}
                className={inputClass}
                value={line.description}
                onChange={(event) => update(index, { description: event.target.value })}
                placeholder={t("description")}
              />

              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-16 flex-1">
                  <span className="text-caption text-fg-muted block" aria-hidden>
                    {t("quantity")}
                  </span>
                  <input
                    aria-label={`${t("quantityFull")} ${index + 1}`}
                    inputMode="decimal"
                    className={cn(
                      inputClass,
                      "mt-0.5",
                      line.quantity !== "" &&
                        quantityThousandths === null &&
                        "border-blocked-solid",
                    )}
                    value={line.quantity}
                    onChange={(event) => update(index, { quantity: event.target.value })}
                  />
                </label>

                <label className="min-w-28 flex-[2]">
                  <span className="text-caption text-fg-muted block" aria-hidden>
                    {t("unitPrice")}
                  </span>
                  <input
                    aria-label={`${t("unitPrice")} ${index + 1}`}
                    inputMode="decimal"
                    className={cn(
                      inputClass,
                      "mt-0.5",
                      line.unitPrice !== "" && unitPrice === null && "border-blocked-solid",
                    )}
                    value={line.unitPrice}
                    onChange={(event) => update(index, { unitPrice: event.target.value })}
                  />
                </label>

                <label className="min-w-20 flex-1">
                  <span className="text-caption text-fg-muted block" aria-hidden>
                    {t("taxRate")}
                  </span>
                  <select
                    aria-label={`${t("taxRate")} ${index + 1}`}
                    className={cn(inputClass, "mt-0.5")}
                    value={line.taxRateBasisPoints}
                    onChange={(event) =>
                      update(index, { taxRateBasisPoints: Number(event.target.value) })
                    }
                  >
                    {TAX_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate / 100}%
                      </option>
                    ))}
                  </select>
                </label>

                <span className="text-body text-fg-default min-w-24 pb-2 text-right tabular-nums">
                  {complete ? money(lineTotal(quantityThousandths, unitPrice)) : "—"}
                </span>

                {lines.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("removeLine")}
                    onClick={() => setLines(lines.filter((_, at) => at !== index))}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        size="sm"
        className="mt-3"
        onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
      >
        {t("addLine")}
      </Button>

      {/*
        The running total, from the same functions the server stores with --
        per line, tax line by line. A form that shows one number and saves
        another is worse than a form that shows none.
      */}
      <dl className="border-border mt-4 flex flex-col gap-1 border-t pt-3" aria-live="polite">
        {(
          [
            ["subtotal", totals.subtotal, false],
            ["tax", totals.tax, false],
            ["total", totals.total, true],
          ] as const
        ).map(([key, value, strong]) => (
          <div key={key} className="flex items-baseline justify-between gap-4">
            <dt
              className={cn("text-body", strong ? "text-fg-default font-medium" : "text-fg-muted")}
            >
              {t(key)}
            </dt>
            <dd
              className={cn(
                "text-body tabular-nums",
                strong ? "text-fg-default font-semibold" : "text-fg-muted",
              )}
            >
              {money(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
