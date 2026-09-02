"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { TextField } from "@/components/auth/password-field";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge, CountBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { createProject } from "@/lib/actions/projects";
import { cn } from "@/lib/utils";

/**
 * Guided project creation.
 *
 * Five short steps instead of one long form. The order is the order the
 * decisions actually depend on each other: what it is, who owns it, who is on
 * it, what has to come out of it, and then a look at the whole thing before
 * anything is written.
 *
 * Nothing is saved until the last step. A half-created project that someone
 * abandoned at step three is worse than no project.
 */

export type WizardPerson = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  departmentId: string | null;
  open: number;
  overdue: number;
};

const STEPS = ["essentials", "department", "assignment", "deliverables", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABEL: Record<Step, string> = {
  essentials: "stepEssentials",
  department: "stepDepartment",
  assignment: "stepAssignment",
  deliverables: "stepDeliverables",
  review: "stepReview",
};

export function NewProjectWizard({
  departments,
  people,
}: {
  departments: Array<{ id: string; name: string }>;
  people: WizardPerson[];
}) {
  const t = useTranslations("NewProject");
  const priorities = useTranslations("Priority");

  const [step, setStep] = useState<Step>("essentials");
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: "",
    key: "",
    description: "",
    dueDate: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    departmentId: "",
    ownerUserId: "",
    memberIds: [] as string[],
    deliverables: "",
  });

  const index = STEPS.indexOf(step);
  const isLast = step === "review";

  const inputClass = cn(
    "h-9 w-full rounded-control border px-2.5 text-body",
    "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
    focusRing,
    transition,
  );

  /** Only the essentials can block progress; everything after it is optional. */
  function canContinue(): boolean {
    if (step !== "essentials") return true;
    return form.name.trim().length >= 2 && /^[A-Za-z]{2,5}$/.test(form.key.trim());
  }

  function publish() {
    setFieldErrors({});

    startTransition(async () => {
      const result = await createProject({
        name: form.name,
        key: form.key,
        description: form.description || undefined,
        departmentId: form.departmentId || undefined,
        ownerUserId: form.ownerUserId || undefined,
        dueDate: form.dueDate || undefined,
        priority: form.priority,
        memberIds: form.memberIds,
        deliverables: form.deliverables
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length >= 2),
      });

      // A successful create redirects, so reaching here means it failed.
      if (result && !result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setStep("essentials");
      }
    });
  }

  const deliverables = form.deliverables
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);

  const team = people.filter((person) => form.memberIds.includes(person.userId));

  return (
    <div>
      {/* The whole path, with the current step marked -- so nobody wonders how
          much is left, which is the main thing a wizard has to answer. */}
      <ol className="mb-6 flex flex-wrap items-center gap-1.5">
        {STEPS.map((entry, entryIndex) => {
          const done = entryIndex < index;
          const current = entry === step;

          return (
            <li key={entry} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => (entryIndex <= index ? setStep(entry) : undefined)}
                disabled={entryIndex > index}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "text-label inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5",
                  focusRing,
                  transition,
                  current && "bg-accent-subtle text-accent-text font-semibold",
                  done && "text-fg-muted hover:bg-surface-hover",
                  !current && !done && "text-fg-subtle cursor-default",
                )}
              >
                {done ? <Check aria-hidden className="size-3.5" /> : null}
                {t(STEP_LABEL[entry] as "stepEssentials")}
              </button>
              {entryIndex < STEPS.length - 1 ? (
                <span aria-hidden className="text-fg-subtle">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="text-caption text-fg-muted mb-4">
        {t("stepOf", { step: index + 1, total: STEPS.length })}
      </p>

      <Card>
        <CardContent className="p-5">
          {step === "essentials" ? (
            <div className="flex max-w-lg flex-col gap-4">
              <TextField
                name="name"
                label={t("name")}
                placeholder={t("namePlaceholder")}
                value={form.name}
                onValueChange={(value) => setForm((previous) => ({ ...previous, name: value }))}
                error={fieldErrors.name ? t("invalid") : undefined}
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-key" className="text-label text-fg-default w-fit">
                  {t("key")}
                </label>
                <input
                  id="project-key"
                  value={form.key}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      key: event.target.value.toUpperCase().slice(0, 5),
                    }))
                  }
                  aria-describedby="project-key-hint"
                  aria-invalid={fieldErrors.key ? true : undefined}
                  className={cn(inputClass, "max-w-32 uppercase")}
                />
                <p id="project-key-hint" className="text-caption text-fg-muted">
                  {t("keyHint")}
                </p>
                {fieldErrors.key ? (
                  <p className="text-caption text-blocked-text">
                    {t(fieldErrors.key === "keyTaken" ? "keyTaken" : "keyFormat")}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-description" className="text-label text-fg-default w-fit">
                  {t("description")}
                </label>
                <Textarea
                  id="project-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder={t("descriptionPlaceholder")}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="project-due" className="text-label text-fg-default w-fit">
                    {t("dueDate")}
                  </label>
                  <input
                    id="project-due"
                    type="date"
                    value={form.dueDate}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, dueDate: event.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="project-priority" className="text-label text-fg-default w-fit">
                    {t("priority")}
                  </label>
                  <select
                    id="project-priority"
                    value={form.priority}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        priority: event.target.value as typeof previous.priority,
                      }))
                    }
                    className={inputClass}
                  >
                    {(["low", "medium", "high", "urgent"] as const).map((option) => (
                      <option key={option} value={option}>
                        {priorities(option)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {step === "department" ? (
            <div className="flex max-w-lg flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-department" className="text-label text-fg-default w-fit">
                  {t("department")}
                </label>
                <select
                  id="project-department"
                  value={form.departmentId}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, departmentId: event.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="">{t("noDepartment")}</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-owner" className="text-label text-fg-default w-fit">
                  {t("owner")}
                </label>
                <select
                  id="project-owner"
                  value={form.ownerUserId}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, ownerUserId: event.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="">--</option>
                  {people.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {step === "assignment" ? (
            <div>
              <h2 className="text-heading font-display text-fg-default">{t("assignment")}</h2>
              <p className="text-body text-fg-muted mt-1">{t("assignmentBody")}</p>

              <ul className="border-border divide-border mt-4 divide-y rounded-card border">
                {people
                  .filter(
                    (person) =>
                      !form.departmentId || person.departmentId === form.departmentId,
                  )
                  .map((person) => {
                    const selected = form.memberIds.includes(person.userId);

                    return (
                      <li key={person.userId}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 px-4 py-3",
                            "hover:bg-surface-hover",
                            transition,
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              setForm((previous) => ({
                                ...previous,
                                memberIds: event.target.checked
                                  ? [...previous.memberIds, person.userId]
                                  : previous.memberIds.filter((id) => id !== person.userId),
                              }))
                            }
                            className={cn("accent-accent size-4 rounded-[4px]", focusRing)}
                          />
                          <PersonAvatar name={person.name} src={person.avatarUrl} size="sm" />
                          <span className="text-body text-fg-default min-w-0 flex-1 truncate">
                            {person.name}
                          </span>

                          {/* The whole point of this step: their current load,
                              before you add to it. */}
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-caption text-fg-muted tabular-nums">
                              {t("openTasks", { count: person.open })}
                            </span>
                            {person.overdue > 0 ? (
                              <CountBadge tone="attention">{person.overdue}</CountBadge>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}

          {step === "deliverables" ? (
            <div className="flex max-w-lg flex-col gap-2">
              <label htmlFor="project-deliverables" className="text-label text-fg-default w-fit">
                {t("deliverables")}
              </label>
              <p className="text-caption text-fg-muted">{t("deliverablesBody")}</p>
              <Textarea
                id="project-deliverables"
                value={form.deliverables}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, deliverables: event.target.value }))
                }
                placeholder={t("deliverablesPlaceholder")}
                className="min-h-40"
              />
              <p className="text-caption text-fg-subtle tabular-nums">{deliverables.length}</p>
            </div>
          ) : null}

          {step === "review" ? (
            <div>
              <h2 className="text-heading font-display text-fg-default">{t("review")}</h2>
              <p className="text-body text-fg-muted mt-1">{t("reviewBody")}</p>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <Summary label={t("name")} value={form.name || t("nothingYet")} />
                <Summary label={t("key")} value={form.key || t("nothingYet")} />
                <Summary
                  label={t("department")}
                  value={
                    departments.find((d) => d.id === form.departmentId)?.name ??
                    t("noDepartment")
                  }
                />
                <Summary
                  label={t("owner")}
                  value={
                    people.find((p) => p.userId === form.ownerUserId)?.name ?? t("nothingYet")
                  }
                />
                <Summary label={t("dueDate")} value={form.dueDate || t("nothingYet")} />
                <Summary label={t("priority")} value={priorities(form.priority)} />
              </dl>

              <div className="mt-5">
                <p className="text-label text-fg-default">{t("assignment")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {team.length === 0 ? (
                    <span className="text-body text-fg-subtle">{t("nothingYet")}</span>
                  ) : (
                    team.map((person) => <Badge key={person.userId}>{person.name}</Badge>)
                  )}
                </div>
              </div>

              <div className="mt-5">
                <p className="text-label text-fg-default">{t("deliverables")}</p>
                {deliverables.length === 0 ? (
                  <p className="text-body text-fg-subtle mt-2">{t("nothingYet")}</p>
                ) : (
                  <ul className="text-body text-fg-default mt-2 list-inside list-disc">
                    {deliverables.map((line, lineIndex) => (
                      <li key={`${line}-${lineIndex}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center gap-2">
        {index > 0 ? (
          <Button variant="secondary" onClick={() => setStep(STEPS[index - 1]!)}>
            {t("back")}
          </Button>
        ) : null}

        {isLast ? (
          <Button variant="primary" loading={pending} onClick={publish}>
            {pending ? t("publishing") : t("publish")}
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!canContinue()}
            onClick={() => setStep(STEPS[index + 1]!)}
          >
            {t("continue")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="text-body text-fg-default mt-0.5">{value}</dd>
    </div>
  );
}
