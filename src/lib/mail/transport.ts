import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { outboxMessages } from "@/db/schema";
import { withOrg } from "@/db/tenancy";
import type { Actor } from "@/lib/authz";
import { env } from "@/lib/env";

import { formatRecipient, isDue, isSendable, safeSubject, type MailMessage } from "./message";

/**
 * Sending, or deliberately not sending.
 *
 * Two things happen to every message and they are kept apart on purpose:
 *
 * 1. **It is written to the outbox**, always, in the caller's transaction if
 *    there is one. This never fails for a reason outside the database, so
 *    inviting somebody cannot fail because a mail server is down.
 * 2. **Delivery is attempted**, separately, by whichever driver is configured.
 *    On this deployment that is `outbox`, which attempts nothing.
 *
 * Keeping them apart is what makes the LAN deployment honest rather than
 * pretending: the app does everything it would do with mail except the part it
 * genuinely cannot do, and the part it cannot do is visible on a screen.
 */

export type Driver = {
  readonly name: string;
  /**
   * Deliver, or throw. Returning normally means it left this machine; the
   * outbox marks the row `sent` on that basis and nothing more -- no bounce
   * handling, which would need a mailbox to read.
   */
  send(message: MailMessage, from: string): Promise<void>;
};

/**
 * The default, and the only one this deployment uses.
 *
 * It is not a stub. A message reaching this driver has been recorded in full
 * and can be read by an admin -- which on a network with no mail server is the
 * whole of what "sending" can mean. It reports `skipped` rather than `sent`,
 * because saying a message was sent when nothing left the building is the one
 * lie this system must not tell.
 */
const outboxOnly: Driver = {
  name: "outbox",
  async send() {
    throw new SkipDelivery();
  },
};

/** Not a failure: a deliberate decision not to attempt delivery. */
export class SkipDelivery extends Error {
  constructor() {
    super("No mail driver is configured; the message was recorded and not sent.");
    this.name = "SkipDelivery";
  }
}

/**
 * SMTP, for the day this runs somewhere with a mail server.
 *
 * Loaded on demand so `nodemailer` is never required on a deployment that does
 * not use it -- the LAN build does not pay for a dependency it will not call.
 */
const smtp: Driver = {
  name: "smtp",
  async send(message, from) {
    const config = env();
    if (!config.SMTP_HOST) throw new Error("MAIL_DRIVER=smtp but SMTP_HOST is not set");

    const { createTransport } = await import("nodemailer");

    const transport = createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? "" }
        : undefined,
    });

    await transport.sendMail({
      from,
      to: formatRecipient(message.toEmail, message.toName),
      subject: safeSubject(message.subject),
      text: message.body,
    });
  },
};

export function driver(): Driver {
  return env().MAIL_DRIVER === "smtp" ? smtp : outboxOnly;
}

/**
 * Record a message. Never throws for a reason outside the database.
 *
 * An address that could not possibly be delivered to is still recorded, as
 * `failed` with a reason -- somebody typing `nobody@localhost` into the invite
 * form should be able to find out why nothing happened, and a row that was
 * never written is a row nobody can look at.
 */
export async function queue(
  actor: Actor,
  message: MailMessage,
  tx?: Parameters<typeof withOrg>[1],
): Promise<{ id: string }> {
  const sendable = isSendable(message.toEmail);

  const [row] = await withOrg(actor.organizationId, tx).insert(outboxMessages, {
    toEmail: message.toEmail.trim(),
    toName: message.toName,
    subject: safeSubject(message.subject),
    body: message.body,
    kind: message.kind,
    status: sendable ? "queued" : "failed",
    attempts: sendable ? 0 : 1,
    lastError: sendable ? null : "That address cannot be delivered to.",
  });

  return { id: row.id };
}

/**
 * Try to deliver what is waiting.
 *
 * Called without being awaited after queueing, so an invite form does not sit
 * on an SMTP timeout, and again from the outbox screen's retry button. There
 * is no scheduler on this deployment -- recorded in KNOWN-GAPS -- so those two
 * are the only things that ever move a message.
 */
export async function flush(
  actor: Actor,
  ids?: string[],
): Promise<{ sent: number; failed: number }> {
  const scope = withOrg(actor.organizationId);
  const active = driver();
  const from = env().MAIL_FROM ?? "brandshift@localhost";

  const waiting = await scope.select(
    outboxMessages,
    ids && ids.length > 0
      ? inArray(outboxMessages.id, ids)
      : and(
          inArray(outboxMessages.status, ["queued", "failed"]),
          eq(outboxMessages.organizationId, actor.organizationId),
        ),
  );

  const now = new Date();
  const due = waiting
    .filter((row) => row.status === "queued" || isDue(row.attempts, row.updatedAt, now))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 50);

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    try {
      await active.send(
        {
          toEmail: row.toEmail,
          toName: row.toName,
          subject: row.subject,
          body: row.body,
          kind: row.kind as MailMessage["kind"],
        },
        from,
      );

      await scope.update(
        outboxMessages,
        { status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() },
        eq(outboxMessages.id, row.id),
      );
      sent += 1;
    } catch (error) {
      const skipped = error instanceof SkipDelivery;

      await scope.update(
        outboxMessages,
        {
          // `skipped` is terminal and is not a failure: nothing was attempted,
          // so counting an attempt or an error would be untrue.
          status: skipped ? "skipped" : "failed",
          attempts: skipped ? row.attempts : row.attempts + 1,
          lastError: skipped ? null : String(error instanceof Error ? error.message : error),
          updatedAt: new Date(),
        },
        eq(outboxMessages.id, row.id),
      );

      if (!skipped) failed += 1;
    }
  }

  return { sent, failed };
}

/** The outbox, newest first. Behind `member.invite` -- bodies carry links. */
export async function listOutbox(actor: Actor, limit = 100) {
  const rows = await withOrg(actor.organizationId).select(outboxMessages);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
