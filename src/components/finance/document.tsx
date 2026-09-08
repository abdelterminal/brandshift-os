import { getFormatter, getTranslations } from "next-intl/server";

import { TableContainer } from "@/components/ui/table";
import type { DocumentLine } from "@/lib/data/finance";
import { quantityToString } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The lines of a quote or an invoice, as the client would read them.
 *
 * A table, and a scrolling one below about 34rem: a document is columns of
 * figures, and squeezing them into a phone by shrinking the type would put
 * money below 12px. It scrolls inside its own box rather than moving the page.
 *
 * `relative` because `sr-only` is `position: absolute` -- without a positioned
 * ancestor those spans escape the clip and widen the whole document.
 */
export async function DocumentLines({
  lines,
  currency,
  subtotal,
  tax,
  total,
  paid,
}: {
  lines: DocumentLine[];
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  /** Only invoices have this. */
  paid?: number;
}) {
  const [t, format] = await Promise.all([getTranslations("Finance"), getFormatter()]);

  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency });

  return (
    <>
      <div className="border-border bg-surface-raised divide-border divide-y rounded-card border sm:hidden">
        {lines.map(line => <div key={line.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-body text-fg-default min-w-0 break-words font-medium">{line.description}</p>
            <p className="text-body text-fg-default font-semibold tabular-nums">{money(line.lineTotal)}</p>
          </div>
          <dl className="text-caption text-fg-muted mt-3 grid grid-cols-2 gap-2">
            <div><dt>{t("quantity")}</dt><dd>{quantityToString(line.quantityThousandths)}</dd></div>
            <div><dt>{t("unitPrice")}</dt><dd>{money(line.unitPrice)}</dd></div>
            <div><dt>{t("taxRate")}</dt><dd>{line.taxRateBasisPoints / 100}%</dd></div>
          </dl>
        </div>)}
        <dl className="p-4">
          {([["subtotal", subtotal], ["tax", tax], ["total", total], ...(paid !== undefined && paid > 0 ? [["paid", paid], ["owed", total - paid]] : [])] as Array<[string, number]>).map(([key, value]) =>
            <div key={key} className={cn("text-body flex flex-wrap justify-between gap-2 py-1", key === "total" || key === "owed" ? "text-fg-default font-semibold" : "text-fg-muted")}><dt>{t(key)}</dt><dd className="tabular-nums">{money(value)}</dd></div>)}
        </dl>
      </div>
      <TableContainer aria-label={t("lines")} className="bg-surface-raised hidden sm:block">
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr className="border-border border-b">
            <th scope="col" className="text-caption text-fg-muted px-4 py-2 text-left font-medium">
              {t("description")}
            </th>
            <th scope="col" className="text-caption text-fg-muted px-4 py-2 text-right font-medium">
              {t("quantity")}
            </th>
            <th scope="col" className="text-caption text-fg-muted px-4 py-2 text-right font-medium">
              {t("unitPrice")}
            </th>
            <th scope="col" className="text-caption text-fg-muted px-4 py-2 text-right font-medium">
              {t("taxRate")}
            </th>
            <th scope="col" className="text-caption text-fg-muted px-4 py-2 text-right font-medium">
              {t("lineTotal")}
            </th>
          </tr>
        </thead>

        <tbody className="divide-border divide-y">
          {lines.map((line) => (
            <tr key={line.id}>
              <td className="text-body text-fg-default px-4 py-2">{line.description}</td>
              <td className="text-body text-fg-muted px-4 py-2 text-right tabular-nums">
                {quantityToString(line.quantityThousandths)}
              </td>
              <td className="text-body text-fg-muted px-4 py-2 text-right tabular-nums">
                {money(line.unitPrice)}
              </td>
              <td className="text-body text-fg-muted px-4 py-2 text-right tabular-nums">
                {line.taxRateBasisPoints / 100}%
              </td>
              <td className="text-body text-fg-default px-4 py-2 text-right tabular-nums">
                {money(line.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot className="border-border border-t">
          {(
            [
              ["subtotal", subtotal, false],
              ["tax", tax, false],
              ["total", total, true],
              ...(paid !== undefined && paid > 0
                ? ([
                    ["paid", paid, false],
                    ["owed", total - paid, true],
                  ] as const)
                : []),
            ] as const
          ).map(([key, value, strong]) => (
            <tr key={key}>
              <th
                scope="row"
                colSpan={4}
                className={cn(
                  "px-4 py-1.5 text-right",
                  strong
                    ? "text-body text-fg-default font-semibold"
                    : "text-body text-fg-muted font-normal",
                )}
              >
                {t(key)}
              </th>
              <td
                className={cn(
                  "px-4 py-1.5 text-right tabular-nums",
                  strong ? "text-body text-fg-default font-semibold" : "text-body text-fg-muted",
                )}
              >
                {money(value)}
              </td>
            </tr>
          ))}
        </tfoot>
      </table>
    </TableContainer>
    </>
  );
}
