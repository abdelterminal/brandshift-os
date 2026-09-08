"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { addExpense, quoteToProject } from "@/lib/actions/finance";
import { cn } from "@/lib/utils";

/**
 * Drafting the documents.
 *
 * Quotes and invoices start on routed composer pages. The small expense and
 * conversion decisions remain dialogs and reuse their existing actions.
 *
 * Every error the server can return has its own message. "Check the fields" on
 * a document with fifteen lines is not help.
 */

export type Option = { id: string; label: string };

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

/** One place that turns a server error code into something readable. */
function useErrorText() {
  const t = useTranslations("Finance");
  return (code: string) => {
    const known: Record<string, string> = {
      money: t("money"),
      quantity: t("quantity_invalid"),
      noLines: t("noLines"),
      dueBeforeIssue: t("dueBeforeIssue"),
      keyTaken: t("keyTaken"),
      notAccepted: t("notAccepted"),
      alreadyConverted: t("alreadyConverted"),
    };
    return known[code] ?? t("invalid");
  };
}

// ---------------------------------------------------------------------------

export function NewQuoteDialog(props: {
  companies: Option[]; currency: string; today: string; defaultCompanyId?: string;
}) {
  const t = useTranslations("Finance");
  const href = props.defaultCompanyId ? `/finance/quotes/new?company=${encodeURIComponent(props.defaultCompanyId)}` : "/finance/quotes/new";
  return <Button variant="primary" render={<Link href={href} />}>{t("newQuote")}</Button>;
}

export function NewInvoiceDialog(_props: {
  companies: Option[]; projects: Option[]; currency: string; today: string; dueDefault: string;
}) {
  const t = useTranslations("Finance");
  return <Button variant="primary" render={<Link href="/finance/invoices/new" />}>{t("newInvoice")}</Button>;
}

const CATEGORIES = [
  "subcontractor",
  "software",
  "travel",
  "equipment",
  "production",
  "other",
] as const;

export function NewExpenseDialog({ projects, today }: { projects: Option[]; today: string }) {
  const t = useTranslations("Finance");
  const categories = useTranslations("ExpenseCategory");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("other");
  const [spentOn, setSpentOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reimbursable, setReimbursable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("newExpense")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newExpense")}</DialogTitle>
            <DialogDescription>{t("expensesSubtitle")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await addExpense({
                  description,
                  category,
                  spentOn,
                  amount,
                  taxAmount: taxAmount || undefined,
                  supplier: supplier || undefined,
                  projectId: projectId || null,
                  reimbursable,
                });

                if (result.ok) {
                  setOpen(false);
                  setDescription("");
                  setAmount("");
                  setTaxAmount("");
                  setSupplier("");
                  router.refresh();
                  return;
                }
                setError(errorText(result.error));
              });
            }}
          >
            <Field>
              <FieldLabel>{t("description")}</FieldLabel>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("amount")}</FieldLabel>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("tax")}</FieldLabel>
                <Input
                  inputMode="decimal"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="expense-category">{t("category")}</FieldLabel>
                <select
                  id="expense-category"
                  className={selectClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                >
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {categories(value)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel>{t("spentOn")}</FieldLabel>
                <Input
                  type="date"
                  value={spentOn}
                  onChange={(e) => setSpentOn(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("supplier")}</FieldLabel>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </Field>

              <Field>
                <FieldLabel htmlFor="expense-project">{t("project")}</FieldLabel>
                <select
                  id="expense-project"
                  className={selectClass}
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">{t("noProject")}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field>
              <label className="text-label text-fg-default flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reimbursable}
                  onChange={(e) => setReimbursable(e.target.checked)}
                  className={cn("accent-accent size-4 rounded-[4px]", focusRing)}
                />
                {t("reimbursable")}
              </label>
              <FieldDescription>{t("paidBy")}</FieldDescription>
            </Field>

            {error ? (
              <p role="alert" className="text-body text-blocked-text">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose render={<Button type="button">{t("cancel")}</Button>} />
              <Button
                type="submit"
                variant="primary"
                loading={pending}
                disabled={description.trim().length === 0 || amount.trim().length === 0}
              >
                {pending ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

/** An accepted quote becoming the work it pays for. */
export function ConvertQuoteDialog({ quoteId, title }: { quoteId: string; title: string }) {
  const t = useTranslations("Finance");
  const errorText = useErrorText();

  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        {t("convert")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("convertTitle")}</DialogTitle>
            <DialogDescription>{t("convertBody")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await quoteToProject({ quoteId, key, name });
                if (result && !result.ok) setError(errorText(result.error));
              });
            }}
          >
            <Field>
              <FieldLabel>{t("projectName")}</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>

            <Field>
              <FieldLabel>{t("projectKey")}</FieldLabel>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                maxLength={5}
                required
              />
              <FieldDescription>{t("projectKeyHint")}</FieldDescription>
            </Field>

            {error ? (
              <p role="alert" className="text-body text-blocked-text">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose render={<Button type="button">{t("cancel")}</Button>} />
              <Button
                type="submit"
                variant="primary"
                loading={pending}
                disabled={!/^[A-Z]{2,5}$/.test(key) || name.trim().length < 2}
              >
                {t("convertAction")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
