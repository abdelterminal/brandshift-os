import { getFormatter, getTranslations } from "next-intl/server";

import type { DocumentLine } from "@/lib/data/finance";
import type { Letterhead } from "@/lib/data/organization";
import { quantityToString } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A quote or an invoice as the client receives it -- the letterhead, the
 * lines and what each one covers, the total, the conditions, the place to
 * sign.
 *
 * The layout follows the Mediast devis: wordmark and label in ink across the
 * top, the city and the date facing each other on the dateline below it, the
 * services with their inclusions bulleted underneath, an ink totals bar, a
 * neutral restatement of the figure, the conditions, and two boxes to sign.
 *
 * Three things it does deliberately.
 *
 * **The red signs the document; it does not carry it.** One full stop after
 * the wordmark, and the bullets. Everything structural -- the label, the
 * totals bar -- is ink. The bar is the largest filled shape on the page, and
 * in red it would spend the whole <=5% allowance on a number that is not an
 * action.
 *
 * **What is not included is set apart.** `details` and `exclusions` are two
 * fields, not one with a marker character, and an exclusion prints grey with
 * a grey dot after everything the line does cover. An exclusion in the same
 * ink as an inclusion is how a scope argument starts.
 *
 * **Nothing is invented.** The reference devis states a deposit split in its
 * recap block; there is no deposit column here, so the block states the
 * amount due and any such wording arrives through `terms`, where the person
 * writing the quote decides it. The reference also prints "Validité 30
 * jours" -- a duration this schema does not hold -- so the dateline gives the
 * date the document actually expires on.
 *
 * Colour comes from tokens throughout: `--brand` is the brand red and the
 * codebase forbids the literal. Inside `.sheet` the semantic tokens are
 * re-pointed at their light values, so the component never learns it is
 * printing.
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

  const conditions = toBullets(terms);

  const head =
    "text-caption text-fg-subtle pb-[1.5mm] font-semibold uppercase tracking-wider text-right pl-4";

  return (
    <article className="sheet font-sans flex flex-col">
      {/* ---- letterhead ---------------------------------------------- */}
      <header className="border-border mb-[6mm] border-b pb-[3mm]">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            {letterhead.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- an arbitrary
                 tenant URL printed at a fixed width. next/image would optimise
                 nothing here and needs every tenant's host allow-listed. */
              <img src={letterhead.logoUrl} alt={letterhead.name} className="h-[10mm] w-auto" />
            ) : (
              <p className="font-display text-display text-fg-default font-bold">
                {letterhead.name}
                {/* The whole of the brand red on this document: one full stop
                    after the name, and the bullets further down. Ink carries
                    the document; the red only signs it. */}
                <span aria-hidden className="text-brand">
                  .
                </span>
              </p>
            )}
            {letterhead.tagline ? (
              <p className="text-caption text-fg-subtle mt-[2mm]">{letterhead.tagline}</p>
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            <p className="font-display text-display text-fg-default font-bold tracking-wide uppercase">
              {t(kind)}
            </p>
            <p className="text-caption text-fg-muted mt-[2mm] tabular-nums">
              {t("reference", { number })}
            </p>
          </div>
        </div>

        {/*
          Where it was written and when, on one line across the page. The city
          belongs beside the date rather than under the tagline: together they
          are the dateline of the document, and a client checking whether a
          quote is still open reads them as a pair.
        */}
        <div className="mt-[4mm] flex items-baseline justify-between gap-6">
          <p className="text-caption text-fg-muted">{letterhead.city}</p>
          <p className="text-caption text-fg-muted tabular-nums">
            {[
              day(issueDate),
              untilDate
                ? t(kind === "quote" ? "validUntil" : "dueOn", {
                    date: day(untilDate),
                  })
                : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
      </header>

      {/* ---- who it is for ------------------------------------------- */}
      <section className="mb-[6mm]">
        <p className="text-caption text-fg-muted">{t("preparedFor")}</p>
        <h1 className="font-display text-display-lg text-fg-default mt-[2mm] font-bold">
          {client}
        </h1>
        {client === title ? null : <p className="text-body text-fg-muted mt-[1mm]">{title}</p>}
      </section>

      {/* ---- the lines ----------------------------------------------- */}
      <table className="mb-[5mm] w-full border-collapse">
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
          {lines.map((line) => {
            const included = toBullets(line.details);
            const excluded = toBullets(line.exclusions);

            return (
              <tr key={line.id} className="sheet-keep-together align-top">
                <td className="py-[2.2mm] pr-4">
                  <p className="text-body text-fg-default font-semibold">{line.description}</p>

                  {/*
                    What the line covers, and then what it does not. The
                    exclusions come last and in the quieter colour because
                    that is the order somebody reads them in -- you find out
                    what you are buying before you find out what you are not
                    -- and because an exclusion set in the same ink as an
                    inclusion is how a scope argument starts.
                  */}
                  {included.length > 0 || excluded.length > 0 ? (
                    <ul className="mt-[1.2mm] space-y-[0.8mm]">
                      {included.map((bullet, index) => (
                        <Bullet key={`in-${index}`} text={bullet} />
                      ))}
                      {excluded.map((bullet, index) => (
                        <Bullet key={`ex-${index}`} text={bullet} excluded />
                      ))}
                    </ul>
                  ) : null}
                </td>

                {detailed ? (
                  <>
                    <td className="text-body text-fg-muted py-[2.2mm] pl-4 text-right tabular-nums">
                      {quantityToString(line.quantityThousandths)}
                    </td>
                    <td className="text-body text-fg-muted py-[2.2mm] pl-4 text-right tabular-nums">
                      {money(line.unitPrice)}
                    </td>
                  </>
                ) : null}
                <td className="text-body text-fg-default py-[2.2mm] pl-4 text-right font-semibold tabular-nums">
                  {money(line.lineTotal)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ---- totals --------------------------------------------------- */}
      <section className="sheet-keep-together mb-[5mm]">
        {/* The way there stays in a narrow right-hand column, where a column
            of figures belongs. */}
        <div className="flex justify-end">
          <div className="w-[78mm]">
            <Row label={t("subtotal")} value={money(subtotal)} />
            <Row
              label={singleRate === null ? t("tax") : t("taxAt", { rate: singleRate / 100 })}
              value={money(tax)}
            />
          </div>
        </div>

        {/*
          The answer runs the full width of the sheet, as it does on the devis
          this follows: it is the line the whole page was written to arrive at,
          and a client scanning for the number should not have to find it in a
          column.

          Ink, not red. The bar is the largest filled shape on the page, and a
          red one spends the whole <=5% allowance on a number that is not an
          action. In ink it reads as the bottom line of a document; the red
          stays on the mark and the bullets, where it means "us".
        */}
        <div className="sheet-total-bar bg-fg-default text-surface-raised rounded-control mt-[3mm] flex items-center justify-between gap-4 px-[4mm] py-2">
          <span className="font-display text-label font-bold tracking-wide uppercase">
            {t("totalDue")}
          </span>
          <span className="font-display text-heading font-bold tabular-nums">{money(total)}</span>
        </div>

        {paid !== undefined && paid > 0 ? (
          <div className="mt-[2mm] flex justify-end">
            <div className="w-[78mm]">
              <Row label={t("paid")} value={money(paid)} />
              <Row label={t("owed")} value={money(total - paid)} strong />
            </div>
          </div>
        ) : null}
      </section>

      {/* ---- what happens next --------------------------------------- */}
      {/* Neutral, for the same reason the bar is: this is the restatement of
          a figure, not a warning about one. */}
      <section className="bg-surface-inset rounded-card sheet-keep-together mb-[6mm] px-[4mm] py-[3mm]">
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
        <section className="mb-[6mm]">
          <h2 className="font-display text-label text-fg-default mb-[3mm] font-bold">
            {t("conditions")}
          </h2>
          <ul className="space-y-[1mm]">
            {conditions.map((condition, index) => (
              <Bullet key={index} text={condition} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- signatures, on a quote only ----------------------------- */}
      {kind === "quote" ? (
        <section className="sheet-keep-together mb-[6mm] grid grid-cols-2 gap-[8mm]">
          {(["client", "provider"] as const).map((party) => (
            <div key={party}>
              <p className="text-caption text-fg-default font-bold">
                {party === "client" ? t("agreedClient") : letterhead.name}
              </p>
              <div className="border-border-control rounded-control mt-[2mm] h-[16mm] border" />
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

/**
 * A newline-separated field as the list it is printed as.
 *
 * Every bulleted field on this sheet -- the conditions, and what each line
 * does and does not cover -- is stored as text with one item per line, so
 * they all arrive here. Blank lines are dropped rather than printed as empty
 * bullets.
 */
function toBullets(value: string | null): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * One bullet under a line.
 *
 * An exclusion is quieter in both marks: grey text and a grey dot. The red
 * dot is a small claim that this is part of the offer, so it would be wrong
 * against something the offer explicitly leaves out.
 */
function Bullet({ text, excluded }: { text: string; excluded?: boolean }) {
  return (
    <li
      className={cn("text-caption flex gap-[2.5mm]", excluded ? "text-fg-subtle" : "text-fg-muted")}
    >
      {/* The dot stays red on an exclusion. It marks the line as ours -- part
          of what we are telling you about this service -- and only the words
          go quiet, which is how the devis this follows does it. */}
      <span aria-hidden className="bg-brand mt-[1.6mm] size-[1.2mm] shrink-0 rounded-full" />
      <span>{text}</span>
    </li>
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
