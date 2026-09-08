import { getFormatter, getTranslations } from "next-intl/server";

import { TableContainer } from "@/components/ui/table";
import type { WeekPoint } from "@/lib/data/insights";
import { cn } from "@/lib/utils";

/**
 * Created against completed, by week.
 *
 * A table with bars drawn on it, not a charting library. Three reasons, in
 * order: the numbers are the point and a table states them exactly; a screen
 * reader gets a real table rather than an SVG it has to be told about; and a
 * chart dependency is a decision that costs more than four `<div>`s with a
 * width on them.
 *
 * No inline `style` either, which the rule forbids outright. Bar widths come
 * from a fixed set of classes in 5% steps -- and nothing is lost by rounding,
 * because the exact number is printed beside every bar. The bar is only there
 * for the shape; the figure is the data.
 */

/**
 * 0% to 100% in twenty steps.
 *
 * Written out because Tailwind generates from literal strings in the source: a
 * class built by interpolation exists at runtime and not in the stylesheet, so
 * every bar would come out empty.
 */
const WIDTHS = [
  "w-[0%]",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-[100%]",
] as const;
export async function WeekChart({ points }: { points: WeekPoint[] }) {
  const [t, format] = await Promise.all([getTranslations("Insights"), getFormatter()]);

  const peak = Math.max(1, ...points.flatMap((point) => [point.created, point.completed]));

  return (
    // `relative` because `sr-only` is `position: absolute`: without a positioned
    // ancestor those spans lay out against the viewport and escape this box,
    // taking the page width with them. Caught twice already on other screens.
    <TableContainer aria-label={t("throughputCaption")} className="bg-surface-raised">
      <table className="w-full min-w-[36rem] border-collapse">
        <caption className="sr-only">{t("throughputCaption")}</caption>

        <thead>
          <tr className="border-border border-b">
            <th scope="col" className="text-caption text-fg-muted px-4 py-2 text-left font-medium">
              {t("week")}
            </th>
            <th scope="col" className="text-caption text-fg-muted px-4 py-2 text-left font-medium">
              {t("created")}
            </th>
            <th scope="col" className="text-caption text-fg-muted px-4 py-2 text-left font-medium">
              {t("completed")}
            </th>
          </tr>
        </thead>

        <tbody className="divide-border divide-y">
          {points.map((point) => {
            const behind = point.created > point.completed;

            return (
              <tr key={point.week}>
                <th
                  scope="row"
                  className="text-caption text-fg-muted w-28 px-4 py-2 text-left font-normal tabular-nums"
                >
                  {format.dateTime(new Date(`${point.week}T12:00:00Z`), {
                    day: "numeric",
                    month: "short",
                  })}
                </th>

                <Bar value={point.created} peak={peak} tone="neutral" />
                {/*
                  Green only when the week kept up. A completed bar that is
                  always green would say "good" about a week that fell behind.
                */}
                <Bar value={point.completed} peak={peak} tone={behind ? "attention" : "complete"} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableContainer>
  );
}

function Bar({
  value,
  peak,
  tone,
}: {
  value: number;
  peak: number;
  tone: "neutral" | "complete" | "attention";
}) {
  const fill = {
    neutral: "bg-status-neutral-solid",
    complete: "bg-complete-solid",
    attention: "bg-attention-solid",
  }[tone];

  return (
    <td className="px-4 py-2">
      <span className="flex items-center gap-2">
        <span className="text-body text-fg-default w-6 shrink-0 tabular-nums">{value}</span>
        <span className="bg-surface-sunken h-2 min-w-0 flex-1 overflow-hidden rounded-pill">
          <span
            aria-hidden
            className={cn(
              "block h-full rounded-pill",
              fill,
              WIDTHS[Math.round((value / peak) * 20)],
            )}
          />
        </span>
      </span>
    </td>
  );
}
