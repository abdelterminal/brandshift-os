import { getFormatter, getTranslations } from "next-intl/server";

import type { DocumentLine } from "@/lib/data/finance";
import type { Letterhead } from "@/lib/data/organization";
import { quantityToString } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A quote or an invoice as the client receives it -- the letterhead, the
 * lines, the red total, the conditions, the place to sign.
 *
 * This is a port of the devis renderer that has been sending BrandShift's
 * quotes since June: the same A4 sheet at a 16mm margin, the same grey
 * uppercase column heads over a hairline, the same solid red bar under the
 * totals, the same pale recap block and the same pair of signature boxes.
 *
 * Three things were translated rather than copied.
 *
 * **Colour comes from tokens.** The original wrote `#FD0000` in twelve places;
 * that is `--brand` here, and the codebase forbids the literal. The one
 * deliberate substitution is the filled totals bar, which uses `--accent` (a
 * shade darker) rather than `--brand`: it is the one place white text sits on
 * red, and `--accent` is the fill that carries white at AA. Side by side you
 * cannot tell them apart, and the wordmark and the bullets keep the true red.
 *
 * **The type is the type it always meant.** The PDF was set in Helvetica
 * because jsPDF ships no fonts -- the tool that generated it declared Space
 * Grotesk and Inter, which are the two fonts this app already loads. Rendering
 * it as HTML is closer to the intended design than the PDF ever was.
 *
 * **Nothing is invented.** The original had a deposit percentage typed into a
 * form; there is no such column here, so the recap block states the amount due
 * and any deposit wording arrives through `terms`, where the person writing
 * the quote decides it. *
 * The wordmark is set at display size for a reason beyond looks: the brand red
 * clears 4:1 on white, which is AA for *large* text but not for body, and 18px
 * bold falls a third of a pixel short of what counts as large. At display size
 * it qualifies, so the document keeps the real red instead of the darker one.
 */

export type SheetKind = "quote" | "invoice";

export type SheetProps = {
  kind: SheetKind;
  letterhead: Letterhead;
  /** `BS-2026-014` and the like. */
  number: string;
  title: string;
  clientName: string | null;
  issueDate: Date;
  /** A quote expires; an invoice falls due. Either may be absent. */
  untilDate: Date | null;
  lines: DocumentLine[];
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  /** Invoices only. */
  paid?: number;
  /** Free text, one condition per line. */
  terms: string | null;
};

export async function DocumentSheet({
  kind,
  letterhead,
  number,
  title,
  clientName,
  issueDate,
  untilDate,
  lines,
  currency,
  subtotal,
  tax,
  total,
  paid,
  terms,
}: SheetProps) {
  const [t, format] = await Promise.all([getTranslations("Sheet"), getFormatter()]);

  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency });
  const day = (value: Date) => format.dateTime(value, { dateStyle: "long" });

  /*
    The original had three columns -- prestation, quantity, price -- because
    its price *was* the line price. Here a line carries a unit price and a
    quantity separately, and showing both when every quantity is 1 puts a
    column of "1" and a duplicated figure on the page. So the sheet keeps the
    original three columns when there is nothing to say, and earns the fourth
    only when a quantity actually differs.
  */
  const detailed = lines.some((line) => line.quantityThousandths !== 1000);

  /*
    One rate if the whole document shares one, which is the ordinary case and
    what lets the totals read "VAT 20%". A document mixing rates says only
    "VAT" -- averaging unlike rates into one displayed percentage would print a
    number nobody could reconcile against the lines above it.
  */
  const rates = new Set(lines.map((line) => line.taxRateBasisPoints));
  const singleRate = rates.size === 1 ? [...rates][0] : null;

  /*
    `companyName` arrives from an inner join, so it is always there -- the type
    is wide only because the join helper widens every column it selects. The
    fallback exists so the document's one <h1> can never render empty, which is
    both an accessibility failure and a quote with no client on it.
  */
  const client = clientName?.trim() || title;

  const conditions = (terms ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const head =
    "text-caption text-fg-subtle pb-[1.5mm] font-semibold uppercase tracking-wider text-right pl-4";

  return (
    <article className="sheet font-sans flex flex-col">
      {/* ---- letterhead ---------------------------------------------- */}
      <header className="border-border mb-[9mm] flex items-start justify-between gap-6 border-b pb-[4mm]">
        <div className="min-w-0">
          {letterhead.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- an arbitrary
               tenant URL printed at a fixed width. next/image would optimise
               nothing here and needs every tenant's host allow-listed. */
            <img src={letterhead.logoUrl} alt={letterhead.name} className="h-[10mm] w-auto" />
          ) : (
            <p className="font-display text-display text-brand font-bold">{letterhead.name}</p>
          )}
          {letterhead.tagline ?? letterhead.city ? (
            <p className="text-caption text-fg-subtle mt-[3mm]">
              {[letterhead.tagline, letterhead.city].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-display text-brand font-bold tracking-wide uppercase">
            {t(kind)}
          </p>
          <p className="text-caption text-fg-muted mt-1 tabular-nums">{number}</p>
          <p className="text-caption text-fg-muted tabular-nums">{day(issueDate)}</p>
          {untilDate ? (
            <p className="text-caption text-fg-muted tabular-nums">
              {t(kind === "quote" ? "validUntil" : "dueOn", { date: day(untilDate) })}
            </p>
          ) : null}
        </div>
      </header>

      {/* ---- who it is for ------------------------------------------- */}
      <section className="mb-[8mm]">
        <p className="text-caption text-fg-muted">{t("preparedFor")}</p>
        <h1 className="font-display text-display-lg text-fg-default mt-[2mm] font-bold">
          {client}
        </h1>
        {client === title ? null : (
          <p className="text-body text-fg-muted mt-[1mm]">{title}</p>
        )}
      </section>

      {/* ---- the lines ----------------------------------------------- */}
      <table className="mb-[6mm] w-full border-collapse">
        <thead>
          <tr className="border-border border-b">
            <th scope="col" className={cn(head, "pl-0 text-left")}>
              {t("service")}
            </th>
            {detailed ? (
              <>
                <th scope="col" className={head}>
                  {t("qty")}
                </th>
                <th scope="col" className={head}>
                  {t("unitPrice")}
                </th>
              </>
            ) : null}
            <th scope="col" className={head}>
              {t("amount")}
            </th>
          </tr>
        </thead>

        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-border/60 border-b">
              <td className="text-body text-fg-default py-[2.4mm] font-semibold">
                {line.description}
              </td>
              {detailed ? (
                <>
                  <td className="text-body text-fg-muted py-[2.4mm] pl-4 text-right tabular-nums">
                    {quantityToString(line.quantityThousandths)}
                  </td>
                  <td className="text-body text-fg-muted py-[2.4mm] pl-4 text-right tabular-nums">
                    {money(line.unitPrice)}
                  </td>
                </>
              ) : null}
              <td className="text-body text-fg-default py-[2.4mm] pl-4 text-right font-semibold tabular-nums">
                {money(line.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---- totals, in the right-hand column ------------------------ */}
      <section className="sheet-keep-together mb-[6mm] flex justify-end">
        <div className="w-[78mm]">
          <Row label={t("subtotal")} value={money(subtotal)} />
          <Row
            label={singleRate === null ? t("tax") : t("taxAt", { rate: singleRate / 100 })}
            value={money(tax)}
          />

          <div className="sheet-total-bar bg-accent text-fg-on-accent rounded-control mt-[2mm] flex items-center justify-between gap-4 px-3 py-2">
            <span className="font-display text-label font-bold tracking-wide uppercase">
              {t("totalDue")}
            </span>
            <span className="font-display text-heading font-bold tabular-nums">{money(total)}</span>
          </div>

          {paid !== undefined && paid > 0 ? (
            <div className="mt-[2mm]">
              <Row label={t("paid")} value={money(paid)} />
              <Row label={t("owed")} value={money(total - paid)} strong />
            </div>
          ) : null}
        </div>
      </section>

      {/* ---- what happens next --------------------------------------- */}
      <section className="bg-accent-subtle rounded-card sheet-keep-together mb-[8mm] px-[4mm] py-[3.5mm]">
        <p className="text-body text-fg-default font-semibold">
          {kind === "quote"
            ? t("onSignature", { amount: money(total) })
            : t("payableBy", {
                amount: money(total - (paid ?? 0)),
                date: untilDate ? day(untilDate) : t("onReceipt"),
              })}
        </p>
      </section>

      {/* ---- conditions ---------------------------------------------- */}
      {conditions.length > 0 ? (
        <section className="mb-[8mm]">
          <h2 className="font-display text-label text-fg-default mb-[3mm] font-bold">
            {t("conditions")}
          </h2>
          <ul className="space-y-[1.5mm]">
            {conditions.map((condition, index) => (
              <li key={index} className="text-caption text-fg-muted flex gap-[2.5mm]">
                <span
                  aria-hidden
                  className="bg-brand mt-[1.8mm] size-[1.2mm] shrink-0 rounded-full"
                />
                <span>{condition}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- signatures, on a quote only ----------------------------- */}
      {kind === "quote" ? (
        <section className="sheet-keep-together mb-[8mm] grid grid-cols-2 gap-[8mm]">
          {(["client", "provider"] as const).map((party) => (
            <div key={party}>
              <p className="text-caption text-fg-default font-bold">
                {party === "client" ? t("agreedClient") : letterhead.name}
              </p>
              <div className="border-border-control rounded-control mt-[2mm] h-[20mm] border" />
              <p className="text-caption text-fg-subtle mt-[1.5mm]">
                {t(party === "client" ? "nameDateSignature" : "dateSignature")}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---- footer --------------------------------------------------- */}
      <footer className="border-border text-caption text-fg-subtle mt-auto flex justify-between gap-4 border-t pt-[3mm]">
        <span>{[letterhead.website, letterhead.contactEmail].filter(Boolean).join("  ·  ")}</span>
        <span>{letterhead.city}</span>
      </footer>
    </article>
  );
}

/** One line of the totals column. */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[1.2mm]">
      <span className={cn("text-body", strong ? "text-fg-default font-semibold" : "text-fg-muted")}>
        {label}
      </span>
      <span
        className={cn(
          "text-body tabular-nums",
          strong ? "text-fg-default font-semibold" : "text-fg-muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}
