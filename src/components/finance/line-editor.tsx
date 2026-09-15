"use client";

import { Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import { QUOTE_LINE_CATEGORIES, QUOTE_LINE_TEMPLATES } from "@/lib/finance/quote-line-templates";
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
  /** One bullet per line, as typed. */
  details: string;
  /** One bullet per line, printed muted and last. */
  exclusions: string;
  quantity: string;
  unitPrice: string;
  taxRateBasisPoints: number;
};

/** The rates an agency in France actually charges. */
const TAX_RATES = [0, 550, 1000, 2000] as const;

export const EMPTY_LINE: DraftLine = {
  description: "",
  details: "",
  exclusions: "",
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
  const ui = useTranslations("Ui");
  const format = useFormatter();

  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency });

  /** Only the lines that are actually complete count towards the total. */
  const parsed = lines.flatMap((line) => {
    const quantityThousandths = parseQuantity(line.quantity);
    const unitPrice = parseMoney(line.unitPrice);
    if (quantityThousandths === null || unitPrice === null) return [];
    return [
      {
        quantityThousandths,
        unitPrice,
        taxRateBasisPoints: line.taxRateBasisPoints,
      },
    ];
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

  // A document almost always shares one rate across every line -- see the
  // sheet's own `singleRate` logic, which prints "VAT 20%" only when this
  // is true and falls back to a bare "VAT" the moment it isn't. So the
  // common case -- add VAT to the whole devis, or take it off entirely --
  // is one control here, applied to every line at once, rather than
  // clicking through each line's own selector to change the same number
  // four times. That per-line selector stays, for the rare document that
  // genuinely mixes rates.
  const bulkTaxRate = lines.every((line) => line.taxRateBasisPoints === lines[0]?.taxRateBasisPoints)
    ? (lines[0]?.taxRateBasisPoints ?? 0)
    : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-label text-fg-default font-medium" id="lines-label">
          {t("lines")}
        </p>
        <label className="flex items-center gap-2">
          <span className="text-caption text-fg-muted">{t("taxForAllLines")}</span>
          <select
            aria-label={t("taxForAllLines")}
            value={bulkTaxRate ?? ""}
            onChange={(event) => {
              const rate = Number(event.target.value);
              setLines(lines.map((line) => ({ ...line, taxRateBasisPoints: rate })));
            }}
            className={cn(
              "h-8 rounded-control border px-2 text-body",
              "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
              focusRing,
              transition,
            )}
          >
            {bulkTaxRate === null ? <option value="">{t("taxMixed")}</option> : null}
            {TAX_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate === 0 ? t("taxNone") : `${rate / 100}%`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-caption text-fg-muted mb-3">{ui("lineGuide")}</p>
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
                required
                value={line.description}
                onChange={(event) => update(index, { description: event.target.value })}
                placeholder={t("description")}
              />

              {/*
                Two fields rather than one with a marker character. What is
                included and what is not read differently on the finished
                document, so they are different questions here too -- and
                nobody has to be told that a leading dash means something.
              */}
              <div className="grid gap-2 sm:grid-cols-2">
                {(["details", "exclusions"] as const).map((field) => (
                  <label key={field}>
                    <span className="text-caption text-fg-muted block">{t(field)}</span>
                    <textarea
                      aria-label={`${t(field)} ${index + 1}`}
                      rows={3}
                      className={cn(inputClass, "mt-0.5 h-auto py-1.5 leading-snug")}
                      placeholder={t(`${field}Hint`)}
                      value={line[field]}
                      onChange={(event) => update(index, { [field]: event.target.value })}
                    />
                  </label>
                ))}
              </div>

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
                    required
                    aria-invalid={line.quantity !== "" && quantityThousandths === null}
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
                    required
                    aria-invalid={line.unitPrice !== "" && unitPrice === null}
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
                      update(index, {
                        taxRateBasisPoints: Number(event.target.value),
                      })
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>
          {t("addLine")}
        </Button>

        {/*
          The studio's own service catalogue -- so a line most often starts
          from a pick, not a blank one typed from scratch. Resets to the
          placeholder after adding, since this is an action, not a field
          with a value of its own.
        */}
        <select
          aria-label={t("addFromTemplate")}
          value=""
          onChange={(event) => {
            const template = QUOTE_LINE_TEMPLATES.find((row) => row.id === event.target.value);
            if (!template) return;
            setLines([
              ...lines,
              {
                description: template.description,
                details: template.details,
                exclusions: template.exclusions,
                quantity: "1",
                unitPrice: template.unitPrice,
                taxRateBasisPoints: EMPTY_LINE.taxRateBasisPoints,
              },
            ]);
          }}
          className={cn(inputClass, "h-8 w-auto max-w-56")}
        >
          <option value="">{t("addFromTemplate")}</option>
          {QUOTE_LINE_CATEGORIES.map((category) => (
            <optgroup key={category} label={t(`templateCategory_${category}`)}>
              {QUOTE_LINE_TEMPLATES.filter((row) => row.category === category).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.description}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

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
