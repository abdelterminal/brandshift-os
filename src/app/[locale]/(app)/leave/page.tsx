import { getFormatter, getTranslations } from "next-intl/server";

import { DecisionButtons, WithdrawButton } from "@/components/leave/decision-controls";
import { RequestLeaveForm } from "@/components/leave/request-form";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { dayKey } from "@/lib/calendar-dates";
import {
  leaveBalances,
  listMyLeave,
  listPendingLeave,
  type LeaveRow,
  type LeaveStatus,
} from "@/lib/data/leave";

/**
 * Time off.
 *
 * Leads with what is waiting for you, if anything is, because that is somebody
 * else's plans held up. Then your own balance and your own requests -- the
 * screen's other job, and the one most people open it for.
 *
 * There is no team calendar here. Approved leave goes on the calendar, which
 * already exists and is where people look for what is happening on a day; a
 * second one on this screen would be the same information twice, drifting.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<LeaveStatus, "complete" | "attention" | "blocked" | "neutral"> = {
  approved: "complete",
  pending: "attention",
  declined: "blocked",
  cancelled: "neutral",
};

export async function generateMetadata() {
  const t = await getTranslations("Leave");
  return { title: t("title") };
}

export default async function LeavePage() {
  const session = await requirePermission("leave.view");

  const timeZone = session.organization.timezone;
  const today = dayKey(new Date(), timeZone);
  const year = Number(today.slice(0, 4));

  // The queue is only fetched for people who can act on it. Reading a list you
  // may not answer is a permission decision made twice, in two places.
  const mayApprove = can(session.actor, "leave.approve");

  const [t, format, mine, balances, waiting] = await Promise.all([
    getTranslations("Leave"),
    getFormatter(),
    listMyLeave(session.actor),
    leaveBalances(session.actor, year, today, [session.actor.userId]),
    mayApprove ? listPendingLeave(session.actor) : Promise.resolve([] as LeaveRow[]),
  ]);

  const balance = balances.get(session.actor.userId);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
            <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
          </div>
          <RequestLeaveForm today={today} />
        </div>
      </header>

      {/*
        Somebody else's plans, waiting on you. Above your own balance because a
        request nobody answers is a holiday somebody cannot book.
      */}
      {mayApprove && waiting.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-label text-fg-default mb-2 font-semibold">{t("waiting")}</h2>
          <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
            {waiting.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <PersonAvatar
                  name={request.userName ?? "?"}
                  src={request.avatarUrl}
                  size="sm"
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <LeaveSummary request={request} showName />
                </span>
                <DecisionButtons id={request.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {balance ? (
        <section className="mb-8">
          <dl className="border-border bg-surface-raised grid grid-cols-2 gap-4 rounded-card border p-4 sm:grid-cols-4">
            {(
              [
                ["allowance", balance.allowance],
                ["taken", balance.taken],
                ["booked", balance.booked],
                ["remaining", balance.remaining],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <dt className="text-caption text-fg-muted">{t(key)}</dt>
                <dd
                  className={
                    key === "remaining"
                      ? "text-heading font-display text-fg-default mt-0.5 tabular-nums"
                      : "text-heading font-display text-fg-muted mt-0.5 tabular-nums"
                  }
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-caption text-fg-subtle mt-1.5">{t("balanceCaption", { year })}</p>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-label text-fg-default font-semibold">{t("mine")}</h2>
          <Button variant="link" size="sm" render={<Link href="/calendar?who=all" />}>
            {t("viewCalendar")}
          </Button>
        </div>

        {mine.length === 0 ? (
          <div className="border-border rounded-card border">
            <EmptyState title={t("noneMine")} description={t("noneMineBody")} />
          </div>
        ) : (
          <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
            {mine.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <LeaveSummary request={request} />
                  {request.decisionNote ? (
                    <span className="text-caption text-fg-muted mt-1 block">
                      {request.decisionNote}
                    </span>
                  ) : null}
                </span>

                <Badge tone={STATUS_TONE[request.status]} size="sm" className="shrink-0">
                  <LeaveStatusLabel status={request.status} />
                </Badge>

                {/* Withdrawing is offered while it can still change anything. */}
                {request.status === "pending" || request.status === "approved" ? (
                  <WithdrawButton id={request.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="sr-only">{format.dateTime(new Date(), { dateStyle: "long" })}</p>
    </div>
  );
}

async function LeaveStatusLabel({ status }: { status: LeaveStatus }) {
  const t = await getTranslations("LeaveStatus");
  return <>{t(status)}</>;
}

/** One line: what kind, which days, and what it costs. */
async function LeaveSummary({
  request,
  showName = false,
}: {
  request: LeaveRow;
  showName?: boolean;
}) {
  const [t, types, format] = await Promise.all([
    getTranslations("Leave"),
    getTranslations("LeaveType"),
    getFormatter(),
  ]);

  // Midday, so a formatter rendering in another zone cannot slide the label
  // onto the day before.
  const at = (day: string) => new Date(`${day}T12:00:00Z`);
  const short = { day: "numeric", month: "short" } as const;

  const range =
    request.startDate === request.endDate
      ? format.dateTime(at(request.startDate), { ...short, year: "numeric" })
      : t("dayRange", {
          from: format.dateTime(at(request.startDate), short),
          to: format.dateTime(at(request.endDate), { ...short, year: "numeric" }),
        });

  return (
    <>
      <span className="text-body text-fg-default block">
        {showName ? `${request.userName} · ` : ""}
        {types(request.type)}
      </span>
      <span className="text-caption text-fg-subtle mt-0.5 block tabular-nums">
        {range} · {request.halfDay ? t("halfDayShort") : t("costs", { days: request.workingDays })}
      </span>
    </>
  );
}
