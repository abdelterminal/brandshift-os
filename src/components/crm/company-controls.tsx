"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useState, useTransition } from "react";

import type { Option } from "@/components/crm/create-dialogs";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { archiveCompanyAction, deleteCompanyAction, editCompany } from "@/lib/actions/crm";
import type { CompanyStatus } from "@/lib/data/crm";
import { cn } from "@/lib/utils";

/**
 * Editing a client, and taking one out of circulation.
 *
 * Both were missing outright: a company's details were write-once, and there
 * was no way at all to stop one appearing in every picker and list. Neither is
 * a delete -- quotes and invoices reference a company with
 * `onDelete: "restrict"`, so a client that has been billed has to go on
 * existing for those records to resolve.
 */

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

const STATUSES = ["prospect", "client", "former"] as const;

export function EditCompanyDialog({
  company,
  people,
}: {
  company: {
    id: string;
    name: string;
    website: string | null;
    industry: string | null;
    status: CompanyStatus;
    ownerUserId: string | null;
  };
  people: Option[];
}) {
  const t = useTranslations("Crm");
  const statuses = useTranslations("CompanyStatus");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company.name);
  const [website, setWebsite] = useState(company.website ?? "");
  const [industry, setIndustry] = useState(company.industry ?? "");
  const [status, setStatus] = useState<CompanyStatus>(company.status);
  const [ownerUserId, setOwnerUserId] = useState(company.ownerUserId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Reopening after a cancel should show what is stored, not what was typed. */
  function onOpenChange(next: boolean) {
    if (next) {
      setName(company.name);
      setWebsite(company.website ?? "");
      setIndustry(company.industry ?? "");
      setStatus(company.status);
      setOwnerUserId(company.ownerUserId ?? "");
      setError(null);
    }
    setOpen(next);
  }

  return (
    <>
      <Button onClick={() => onOpenChange(true)}>{t("editCompany")}</Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editCompany")}</DialogTitle>
            <DialogDescription>{t("editCompanySubtitle")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await editCompany({
                  companyId: company.id,
                  name,
                  website: website || undefined,
                  industry: industry || undefined,
                  status,
                  ownerUserId: ownerUserId || null,
                });
                if (!result.ok) {
                  setError(t("invalid"));
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <Field>
              <FieldLabel>{t("nameLabel")}</FieldLabel>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("website")}</FieldLabel>
                <Input
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder={t("websitePlaceholder")}
                />
              </Field>
              <Field>
                <FieldLabel>{t("industry")}</FieldLabel>
                <Input
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder={t("industryPlaceholder")}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-company-status">{t("status")}</FieldLabel>
                <select
                  id="edit-company-status"
                  className={selectClass}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as CompanyStatus)}
                >
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {statuses(value)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-company-owner">{t("owner")}</FieldLabel>
                <select
                  id="edit-company-owner"
                  className={selectClass}
                  value={ownerUserId}
                  onChange={(event) => setOwnerUserId(event.target.value)}
                >
                  <option value="">—</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

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
                disabled={name.trim().length === 0}
              >
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Archiving asks first; restoring does not.
 *
 * An archived client drops out of every list and picker along with its open
 * deals, so it gets the same confirm-in-place step `ProjectStatusControl` uses
 * for the statuses that end a project -- inline, because a dialog opened from a
 * page that already has one is the stacked-modal shape this app refuses.
 * Restoring only puts things back, so it stays one click.
 */
export function ArchiveCompanyControl({
  companyId,
  companyName,
  archived,
}: {
  companyId: string;
  companyName: string;
  archived: boolean;
}) {
  const t = useTranslations("Crm");
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await archiveCompanyAction({ companyId, archived: next });
      if (!result.ok) {
        setError(t("invalid"));
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (archived) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button loading={pending} onClick={() => apply(false)}>
          {t("restore")}
        </Button>
        {error ? (
          <p role="alert" className="text-caption text-blocked-text">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {confirming ? (
        <>
          <span className="text-caption text-fg-muted">
            {t("archiveConfirm", { name: companyName })}
          </span>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => apply(true)}>
            {t("archiveConfirmButton")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            {t("cancel")}
          </Button>
        </>
      ) : (
        <Button onClick={() => setConfirming(true)}>{t("archive")}</Button>
      )}
      {error ? (
        <p role="alert" className="text-caption text-blocked-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Removing a client for good.
 *
 * Alongside Archive rather than instead of it, because they answer different
 * questions. Archiving means "we are not working with them at the moment" and
 * a click undoes it. This means "this record should not exist" -- a duplicate,
 * a typo, a client created by mistake -- and nothing undoes it. The page puts
 * them on separate rows for that reason: two buttons side by side that read
 * alike, where only one can be undone, is how the wrong one gets pressed.
 *
 * The confirm states what will actually happen, counted from the database
 * rather than described in general terms, because the three outcomes differ:
 * deals go, projects and contacts are kept but unattached, and a client with
 * quotes or invoices cannot be deleted at all. Somebody about to press this
 * should not have to know which of those applies to them.
 */
export function DeleteCompanyControl({
  companyId,
  companyName,
  impact,
}: {
  companyId: string;
  companyName: string;
  impact: {
    projects: number;
    deals: number;
    contacts: number;
    quotes: number;
    invoices: number;
    blocked: boolean;
  };
}) {
  const t = useTranslations("Crm");
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Billed clients are not deletable, and saying so up front is kinder than
  // a button that always refuses. Archive is right there beside it.
  if (impact.blocked) {
    return (
      <p className="text-caption text-fg-muted max-w-md">
        {t("deleteBlocked", { count: impact.quotes + impact.invoices })}
      </p>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          {t("deleteCompany")}
        </Button>
        {error ? (
          <p role="alert" className="text-caption text-blocked-text">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-border bg-surface-inset rounded-control flex max-w-md flex-col gap-3 border p-3">
      <p className="text-body text-fg-default">{t("deleteConfirm", { name: companyName })}</p>

      <ul className="text-caption text-fg-muted list-disc space-y-1 pl-4">
        {impact.deals > 0 ? <li>{t("deleteTakesDeals", { count: impact.deals })}</li> : null}
        {impact.projects > 0 ? (
          <li>{t("deleteKeepsProjects", { count: impact.projects })}</li>
        ) : null}
        {impact.contacts > 0 ? (
          <li>{t("deleteKeepsContacts", { count: impact.contacts })}</li>
        ) : null}
        <li>{t("deleteNoUndo")}</li>
      </ul>

      {error ? (
        <p role="alert" className="text-caption text-blocked-text">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await deleteCompanyAction({ companyId });
              if (!result.ok) {
                setError(result.error === "hasBilling" ? t("deleteBlockedShort") : t("invalid"));
                setConfirming(false);
                return;
              }
              // The page this is on no longer exists.
              router.push("/crm/companies");
              router.refresh();
            })
          }
        >
          {t("deleteConfirmButton")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
