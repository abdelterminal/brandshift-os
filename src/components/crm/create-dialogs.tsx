"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
import { addCompany, addContact, addDeal } from "@/lib/actions/crm";
import { cn } from "@/lib/utils";

/**
 * Creating a company, a contact or a deal.
 *
 * Dialogs, not pages, and the line is the same one the leave form draws: each
 * of these is a handful of short fields and nobody loses twenty minutes if it
 * closes. The project wizard is a page because it is five steps, and a deal or
 * a company detail is a page because it is a thing you come back to.
 */

export type Option = { id: string; label: string };

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

// ---------------------------------------------------------------------------

export function NewCompanyDialog({ people }: { people: Option[] }) {
  const t = useTranslations("Crm");
  const statuses = useTranslations("CompanyStatus");

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [status, setStatus] = useState<"prospect" | "client" | "former">("prospect");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("newCompany")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newCompany")}</DialogTitle>
            <DialogDescription>{t("companiesSubtitle")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await addCompany({
                  name,
                  website: website || undefined,
                  industry: industry || undefined,
                  status,
                  ownerUserId: ownerUserId || null,
                });
                // Success redirects to the new company, so reaching here failed.
                if (result && !result.ok) setError(t("invalid"));
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
                <FieldLabel htmlFor="company-status">{t("status")}</FieldLabel>
                <select
                  id="company-status"
                  className={selectClass}
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as "prospect" | "client" | "former")
                  }
                >
                  {(["prospect", "client", "former"] as const).map((value) => (
                    <option key={value} value={value}>
                      {statuses(value)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="company-owner">{t("owner")}</FieldLabel>
                <select
                  id="company-owner"
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

export function NewContactDialog({
  companies,
  defaultCompanyId,
}: {
  companies: Option[];
  defaultCompanyId?: string;
}) {
  const t = useTranslations("Crm");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("newContact")}</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newContact")}</DialogTitle>
            <DialogDescription>{t("contactsSubtitle")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await addContact({
                  name,
                  email: email || undefined,
                  phone: phone || undefined,
                  jobTitle: jobTitle || undefined,
                  companyId: companyId || null,
                });

                if (result.ok) {
                  setOpen(false);
                  setName("");
                  setEmail("");
                  setPhone("");
                  setJobTitle("");
                  router.refresh();
                  return;
                }
                setError(t("invalid"));
              });
            }}
          >
            <Field>
              <FieldLabel>{t("nameLabel")}</FieldLabel>
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("email")}</FieldLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{t("phone")}</FieldLabel>
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("jobTitle")}</FieldLabel>
                <Input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
              </Field>

              <Field>
                <FieldLabel htmlFor="contact-company">{t("company")}</FieldLabel>
                <select
                  id="contact-company"
                  className={selectClass}
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                >
                  {/* Optional on purpose: somebody met at a conference does not
                      always come with a company, and refusing to store them
                      until they do is how they stay in a phone instead. */}
                  <option value="">{t("noCompany")}</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.label}
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

export function NewDealDialog({
  companies,
  contacts,
  people,
  defaultCompanyId,
}: {
  companies: Option[];
  /** Every contact, with the company each belongs to, so the list can narrow. */
  contacts: Array<Option & { companyId: string | null }>;
  people: Option[];
  defaultCompanyId?: string;
}) {
  const t = useTranslations("Crm");

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [primaryContactId, setPrimaryContactId] = useState("");
  const [value, setValue] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [source, setSource] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Only the chosen company's people. A contact list of everybody is how a
  // deal ends up naming somebody at a different company.
  const availableContacts = companyId
    ? contacts.filter((contact) => contact.companyId === companyId)
    : [];

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {t("newDeal")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("newDeal")}</DialogTitle>
            <DialogDescription>{t("subtitle")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);

              if (!companyId) {
                setError(t("pickCompany"));
                return;
              }

              startTransition(async () => {
                const result = await addDeal({
                  title,
                  companyId,
                  primaryContactId: primaryContactId || null,
                  value: value || undefined,
                  expectedCloseDate: closeDate || undefined,
                  source: source || undefined,
                  ownerUserId: ownerUserId || null,
                });
                // Success redirects to the deal, so reaching here failed.
                if (result && !result.ok) {
                  setError(result.error === "money" ? t("money") : t("invalid"));
                }
              });
            }}
          >
            <Field>
              <FieldLabel>{t("titleLabel")}</FieldLabel>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("titlePlaceholder")}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="deal-company">{t("company")}</FieldLabel>
                <select
                  id="deal-company"
                  className={selectClass}
                  value={companyId}
                  onChange={(event) => {
                    setCompanyId(event.target.value);
                    // The old contact belongs to the old company.
                    setPrimaryContactId("");
                  }}
                  required
                >
                  <option value="">—</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="deal-contact">{t("contact")}</FieldLabel>
                <select
                  id="deal-contact"
                  className={selectClass}
                  value={primaryContactId}
                  onChange={(event) => setPrimaryContactId(event.target.value)}
                  disabled={availableContacts.length === 0}
                >
                  <option value="">{t("noContactChosen")}</option>
                  {availableContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("value")}</FieldLabel>
                <Input
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={t("valuePlaceholder")}
                />
              </Field>
              <Field>
                <FieldLabel>{t("closeDate")}</FieldLabel>
                <Input
                  type="date"
                  value={closeDate}
                  onChange={(event) => setCloseDate(event.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("source")}</FieldLabel>
                <Input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder={t("sourcePlaceholder")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="deal-owner">{t("owner")}</FieldLabel>
                <select
                  id="deal-owner"
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
                disabled={title.trim().length === 0}
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
