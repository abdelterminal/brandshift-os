"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { retryOutbox } from "@/lib/actions/outbox";

/**
 * What the app has written, and whether anything left the building.
 *
 * On a network with no mail server this is not a debugging aid -- it is the
 * delivery mechanism. An admin invites somebody, opens this, and reads out or
 * copies the link. Which is why the message body is here in full rather than
 * summarised, and why the panel is behind `member.invite`: the body carries a
 * token that lets somebody set a password.
 */

export type OutboxRow = {
  id: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  body: string;
  kind: string;
  status: "queued" | "sent" | "failed" | "skipped";
  attempts: number;
  lastError: string | null;
  createdAt: Date;
};

const STATUS_TONE = {
  queued: "neutral",
  sent: "complete",
  failed: "blocked",
  skipped: "neutral",
} as const;

const STATUS_KEY = {
  queued: "statusQueued",
  sent: "statusSent",
  failed: "statusFailed",
  skipped: "statusSkipped",
} as const;

const KIND_KEY: Record<string, string> = {
  invite: "kindInvite",
  reset: "kindReset",
  notification: "kindNotification",
};

/**
 * The link on its own, ready to paste.
 *
 * On a network with no mail server this is the actual delivery step: somebody
 * opens the message, takes the link, and sends it however they already talk to
 * the person -- so making them select a URL out of a wrapped block of text was
 * the wrong amount of friction on the one action this screen exists for.
 *
 * Falls back to showing the link in a selectable field when the clipboard is
 * unavailable, which it is over plain HTTP on anything but localhost -- and a
 * LAN deployment is exactly that.
 */
function CopyLink({ body }: { body: string }) {
  const t = useTranslations("Outbox");

  const link = body.match(/https?:\/\/\S+\/(?:accept|reset)\/\S+/)?.[0];
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!link) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard: over plain HTTP the API is unavailable outside
      // localhost, which is every machine on the network but this one.
      setFailed(true);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={copy}>
        {copied ? t("copied") : t("copyLink")}
      </Button>

      {failed ? (
        <input
          readOnly
          value={link}
          aria-label={t("copyLink")}
          onFocus={(event) => event.currentTarget.select()}
          className="border-border-control bg-surface-raised text-body text-fg-default h-9 min-w-0 flex-1 rounded-control border px-2.5"
        />
      ) : null}
    </div>
  );
}

export function OutboxPanel({ rows, sending }: { rows: OutboxRow[]; sending: boolean }) {
  const t = useTranslations("Outbox");
  const format = useFormatter();
  const router = useRouter();

  const [open, setOpen] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>

      <CardContent>
        <p className="text-body text-fg-muted mb-4">
          {sending ? t("sendingBody") : t("notSendingBody")}
        </p>

        {rows.length === 0 ? (
          <p className="text-body text-fg-muted">{t("emptyBody")}</p>
        ) : (
          <ul className="border-border divide-border rounded-card divide-y border">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <div className="min-w-0">
                    <p className="text-body text-fg-default font-medium">{row.subject}</p>
                    <p className="text-caption text-fg-muted mt-0.5">
                      {[
                        row.toName ? `${row.toName} (${row.toEmail})` : row.toEmail,
                        t(KIND_KEY[row.kind] ?? "kindNotification"),
                        format.dateTime(row.createdAt, { dateStyle: "medium", timeStyle: "short" }),
                      ].join(" · ")}
                    </p>
                    {row.lastError ? (
                      <p className="text-caption text-status-blocked-text mt-1">{row.lastError}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={STATUS_TONE[row.status]}>{t(STATUS_KEY[row.status])}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                    >
                      {open === row.id ? t("hide") : t("show")}
                    </Button>
                  </div>
                </div>

                {open === row.id ? (
                  <>
                    {/*
                      `whitespace-pre-wrap`, because the body is plain text and
                      its line breaks are the only formatting it has.
                    */}
                    <pre className="text-body text-fg-default bg-surface-sunken mt-3 overflow-x-auto rounded-card p-3 font-sans whitespace-pre-wrap">
                      {row.body}
                    </pre>
                    <CopyLink body={row.body} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {sending && rows.some((row) => row.status !== "sent") ? (
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  setResult(await retryOutbox());
                  router.refresh();
                })
              }
            >
              {t("retry")}
            </Button>
            {result ? (
              <p role="status" className="text-body text-fg-muted">
                {t("retried", result)}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
