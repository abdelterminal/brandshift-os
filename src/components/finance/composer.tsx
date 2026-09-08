"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LineEditor, useLines } from "./line-editor";
import { DocumentSheet } from "./sheet";
import type { Option } from "./dialogs";
import type { Letterhead } from "@/lib/data/organization";
import type { DocumentLine } from "@/lib/data/finance";
import { addInvoice, addQuote } from "@/lib/actions/finance";
import { lineTotal, parseMoney, parseQuantity, totalsFor } from "@/lib/money";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

export function DocumentComposer({ kind, companies, projects = [], letterhead, currency, today, dueDefault = "", defaultCompanyId = "" }: {
  kind: "quote" | "invoice"; companies: Option[]; projects?: Option[]; letterhead: Letterhead;
  currency: string; today: string; dueDefault?: string; defaultCompanyId?: string;
}) {
  const t = useTranslations("Finance");
  const ui = useTranslations("Ui");
  const [fullSize, setFullSize] = useState(false);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState(companies.some(c => c.id === defaultCompanyId) ? defaultCompanyId : "");
  const [projectId, setProjectId] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [untilDate, setUntilDate] = useState(kind === "invoice" ? dueDefault : "");
  const { lines, setLines } = useLines();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const back = kind === "quote" ? "/finance/quotes" : "/finance/invoices";
  const inputClass = cn("bg-surface-raised border-border-control text-body text-fg-default h-10 w-full min-w-0 rounded-control border px-3", focusRing);
  const previewLines: DocumentLine[] = lines.flatMap((line, position) => {
    const quantityThousandths = parseQuantity(line.quantity);
    const unitPrice = parseMoney(line.unitPrice);
    if (!line.description.trim() || quantityThousandths === null || unitPrice === null) return [];
    return [{ id: String(position), position, description: line.description, details: line.details || null, exclusions: line.exclusions || null,
      quantityThousandths, unitPrice, taxRateBasisPoints: line.taxRateBasisPoints, lineTotal: lineTotal(quantityThousandths, unitPrice) }];
  });
  const totals = totalsFor(previewLines);
  const ready = title.trim().length >= 1 && !!companyId && !!issueDate && (kind === "quote" || !!untilDate) && previewLines.length === lines.length && lines.length > 0;
  const knownErrors: Record<string, string> = { money: t("money"), quantity: t("quantity_invalid"), noLines: t("noLines"), dueBeforeIssue: t("dueBeforeIssue") };
  // The annotation is a sibling of the label, not a descendant of it: any
  // text inside `<label for>` joins its accessible name, so "Company" would
  // become "Company · Required" for anything -- a screen reader included --
  // that asks for the field by name.
  const field = (id: string, label: string, required: boolean, control: React.ReactNode) => <div className="min-w-0">
    <div className="mb-1.5 flex items-baseline gap-1">
      <label htmlFor={id} className="text-label text-fg-default">{label}</label>
      <span aria-hidden="true" className="text-caption text-fg-muted">· {ui(required ? "required" : "optional")}</span>
    </div>{control}
  </div>;
  return <div className="mx-auto max-w-[100rem] px-5 py-8 sm:px-8">
    <Link href={back} className={cn("text-label text-fg-muted rounded-control hover:underline", focusRing)}>{ui("backToList")}</Link>
    <header className="my-5">
      <h1 className="text-display font-display text-fg-default">{t(kind === "quote" ? "newQuote" : "newInvoice")}</h1>
      <p className="text-body text-fg-muted mt-2">{ui("noChanges")}</p>
    </header>
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form className="min-w-0 space-y-5" onSubmit={event => {
        event.preventDefault(); setError(null);
        startTransition(async () => {
          try {
            const result = kind === "quote"
              ? await addQuote({ title, companyId, issueDate, validUntil: untilDate || undefined, lines })
              : await addInvoice({ title, companyId, projectId: projectId || null, issueDate, dueDate: untilDate, lines });
            if (result && !result.ok) setError(knownErrors[result.error] ?? t("invalid"));
          } catch (failure) {
            // A successful Server Action redirect is handled by Next, not shown as a form error.
            if (failure instanceof Error && "digest" in failure && String(failure.digest).startsWith("NEXT_REDIRECT")) throw failure;
            setError(ui("formError"));
          }
        });
      }}>
        <div className="border-border bg-surface-raised space-y-4 rounded-card border p-4">
          {field("document-title", t("documentTitle"), true, <input id="document-title" className={inputClass} value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} />)}
          {field("document-company", t("company"), true, <select id="document-company" className={inputClass} value={companyId} onChange={e => setCompanyId(e.target.value)} required><option value="">—</option>{companies.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>)}
          {kind === "invoice" ? field("document-project", t("project"), false, <select id="document-project" className={inputClass} value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">{t("noProject")}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("document-issued", t("issued"), true, <input id="document-issued" type="date" className={inputClass} value={issueDate} onChange={e => setIssueDate(e.target.value)} required />)}
            {field("document-until", t(kind === "quote" ? "validUntil" : "due"), kind === "invoice", <input id="document-until" type="date" className={inputClass} value={untilDate} min={issueDate} onChange={e => setUntilDate(e.target.value)} required={kind === "invoice"} />)}
          </div>
        </div>
        <LineEditor lines={lines} setLines={setLines} currency={currency} />
        {error ? <div ref={errorRef} role="alert" tabIndex={-1} className="text-body text-blocked-text border-blocked-border bg-blocked-bg rounded-control border p-3 outline-none">
          <p>{error}</p><a className="mt-2 inline-block underline" href="#document-title">{ui("formError")}</a>
        </div> : null}
        <footer className="wizard-actions bg-surface-base border-border sticky z-20 flex flex-wrap gap-3 rounded-card border p-3">
          {!ready ? <p id="document-requirements" className="text-caption text-fg-muted w-full">{ui("formRequirements")}</p> : null}
          <Button type="submit" variant="primary" loading={pending} disabled={!ready} aria-describedby={!ready ? "document-requirements" : undefined}>{pending ? t("creating") : t("create")}</Button>
          <Button render={<Link href={back} />}>{t("cancel")}</Button>
          <a href="#document-preview" className={cn("text-label text-fg-muted rounded-control px-2 py-2 xl:hidden", focusRing)}>{ui("preview")}</a>
        </footer>
      </form>
      <aside id="document-preview" className="ui-section min-w-0">
        <h2 className="text-heading font-display text-fg-default">{ui("preview")}</h2>
        <p className="text-caption text-fg-muted mt-2">{ui("previewBody")}</p>
        {previewLines.length !== lines.length ? <p className="text-caption text-fg-muted mt-2" role="status">{ui("incompletePreview")}</p> : null}
        <Button type="button" size="sm" className="mt-3" aria-pressed={fullSize} onClick={() => setFullSize(!fullSize)}>{ui(fullSize ? "fitPreview" : "fullPreview")}</Button>
        <div data-full-size={fullSize || undefined} className="document-preview border-border mt-4 overflow-x-auto rounded-card border p-3 focus-visible:outline-focus-ring focus-visible:outline-2" role="region" tabIndex={0} aria-label={ui("preview")}>
          <DocumentSheet preview kind={kind} letterhead={letterhead} number={ui("draft")} title={title} clientName={companies.find(c => c.id === companyId)?.label ?? ui("draft")}
            issueDate={new Date(`${issueDate || today}T12:00:00`)} untilDate={untilDate ? new Date(`${untilDate}T12:00:00`) : null}
            lines={previewLines} currency={currency} subtotal={totals.subtotal} tax={totals.tax} total={totals.total} terms={null} />
        </div>
        <p className="text-caption text-fg-muted mt-3">{ui("previewPages")}</p>
      </aside>
    </div>
  </div>;
}
