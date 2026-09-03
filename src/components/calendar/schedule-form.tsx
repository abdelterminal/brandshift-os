"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { checkConflicts, type ConflictReport } from "@/lib/actions/meeting-conflicts";
import { scheduleMeeting } from "@/lib/actions/meetings";
import { instantFromLocal } from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";

/**
 * Scheduling a meeting.
 *
 * One page, not a wizard: a meeting is five fields, and stepping through five
 * fields is slower than filling them in.
 *
 * The part that earns its keep is the guest list. Each person's existing
 * bookings for the chosen slot are shown *beside their name, while you are
 * choosing* -- the same idea as the project wizard showing someone's workload
 * at the moment you assign them to something. Finding out about the clash
 * after the invitation has gone out is finding out too late.
 */

export type Person = { userId: string; name: string; avatarUrl: string | null };
export type ProjectOption = { id: string; key: string; name: string };

/** Minutes. Long enough to cover a workshop, short enough to stay a list. */
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export function ScheduleForm({
  people,
  projects,
  timeZone,
  defaultStart,
  defaultProjectId,
}: {
  /** Everyone but you: calling a meeting is how you get into it. */
  people: Person[];
  projects: ProjectOption[];
  timeZone: string;
  /** `YYYY-MM-DDTHH:mm` in the organization's zone. */
  defaultStart: string;
  defaultProjectId?: string;
}) {
  const t = useTranslations("Meeting");
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [location, setLocation] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [startsLocal, setStartsLocal] = useState(defaultStart);
  const [duration, setDuration] = useState(60);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ question: string; report: ConflictReport } | null>(null);

  const startsAt = instantFromLocal(startsLocal, timeZone);
  const endsAt = startsAt ? new Date(startsAt.getTime() + duration * 60_000) : null;

  /**
   * The question being asked of the server, as one string.
   *
   * Keying the request this way means the answer can be matched to it, so a
   * reply that arrives after the slot has already moved is simply ignored --
   * and clearing the badges when nobody is selected is a derivation rather
   * than a second write. Null means there is nothing to ask.
   */
  const question =
    startsAt && endsAt && attendees.length > 0
      ? `${startsAt.toISOString()}|${endsAt.toISOString()}|${[...attendees].sort().join(",")}`
      : null;

  /**
   * Ask who is busy whenever the slot or the guest list moves.
   *
   * Debounced, because holding an arrow key in a time field fires on every
   * repeat and the answer only matters once you have stopped.
   */
  useEffect(() => {
    if (!question) return;

    const [start, end, ids] = question.split("|");
    const timer = setTimeout(() => {
      void checkConflicts({
        startsAt: start!,
        endsAt: end!,
        userIds: ids ? ids.split(",") : [],
      }).then((report) => setAnswer({ question, report }));
    }, 250);

    return () => clearTimeout(timer);
  }, [question]);

  // Only an answer to the question currently on screen is shown.
  const conflicts = answer && answer.question === question ? answer.report : {};
  const clashing = attendees.filter((userId) => (conflicts[userId]?.length ?? 0) > 0);

  function submit() {
    setError(null);

    if (!startsAt || !endsAt) {
      setError(t("nothingChosen"));
      return;
    }
    if (title.trim().length === 0) {
      setError(t("invalid"));
      return;
    }

    startTransition(async () => {
      const result = await scheduleMeeting({
        title: title.trim(),
        agenda: agenda.trim() || undefined,
        location: location.trim() || undefined,
        projectId: projectId || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        attendeeUserIds: attendees,
      });

      // A successful schedule redirects, so reaching here means it failed.
      if (result && !result.ok) {
        setError(result.error === "window" ? t("invalidWindow") : t("invalid"));
      }
    });
  }

  const selectClass = cn(
    "h-9 w-full rounded-control border px-2.5 text-body",
    "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
    focusRing,
    transition,
  );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("startsLabel")}</FieldLabel>
          <Input
            type="datetime-local"
            value={startsLocal}
            onChange={(event) => setStartsLocal(event.target.value)}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="meeting-duration">{t("durationLabel")}</FieldLabel>
          <select
            id="meeting-duration"
            className={selectClass}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes < 60
                  ? t("minutes", { count: minutes })
                  : minutes === 60
                    ? t("hour")
                    : t("hours", { count: minutes / 60 })}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("locationLabel")}</FieldLabel>
          <Input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder={t("locationPlaceholder")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="meeting-project">{t("projectLabel")}</FieldLabel>
          <select
            id="meeting-project"
            className={selectClass}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">{t("noProject")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} · {project.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field>
        <FieldLabel>{t("agendaLabel")}</FieldLabel>
        <Textarea
          value={agenda}
          onChange={(event) => setAgenda(event.target.value)}
          placeholder={t("agendaPlaceholder")}
        />
      </Field>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-label text-fg-default font-medium" id="attendees-label">
            {t("attendeesLabel")}
          </p>
          {clashing.length > 0 ? (
            <Badge tone="attention" size="sm">
              {t("conflictWarning", { count: clashing.length })}
            </Badge>
          ) : null}
        </div>

        <ul
          aria-labelledby="attendees-label"
          className="border-border divide-border max-h-80 divide-y overflow-y-auto rounded-card border"
        >
          {people.map((person) => {
            const selected = attendees.includes(person.userId);
            const busy = conflicts[person.userId] ?? [];

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
                      setAttendees((previous) =>
                        event.target.checked
                          ? [...previous, person.userId]
                          : previous.filter((id) => id !== person.userId),
                      )
                    }
                    className={cn("accent-accent size-4 rounded-[4px]", focusRing)}
                  />
                  <PersonAvatar name={person.name} src={person.avatarUrl} size="sm" />
                  <span className="text-body text-fg-default min-w-0 flex-1 truncate">
                    {person.name}
                  </span>

                  {/*
                    The whole point of this list: whether they can actually
                    come, while you are still deciding whether to ask.
                  */}
                  {selected && busy.length > 0 ? (
                    <Badge tone="attention" size="sm" className="max-w-56 shrink-0">
                      <span className="truncate">{t("busy", { title: busy[0]!.title })}</span>
                    </Badge>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/*
        A form-level problem, not a field one: `FieldError` renders only when
        its own control is invalid, and "pick a time first" belongs to the form.
        `role="alert"` so it is announced rather than only seen.
      */}
      {error ? (
        <p role="alert" className="text-body text-blocked-text">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
