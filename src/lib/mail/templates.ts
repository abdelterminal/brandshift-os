import "server-only";

import { getTranslations } from "next-intl/server";

import { withBasePath } from "@/lib/base-path";
import { env } from "@/lib/env";

import type { MailMessage } from "./message";

/**
 * What the messages say.
 *
 * Plain text, and rendered in the *recipient's* locale rather than the sender's
 * -- inviting a French colleague from an English screen should not send them an
 * English email. `getTranslations({ locale })` is what makes that possible
 * without a second catalogue.
 *
 * No HTML. An HTML email is a rendering project with its own testing problem --
 * every client interprets it differently -- and plain text is read correctly by
 * all of them. Recorded in KNOWN-GAPS rather than half-done.
 */

/**
 * Where a link points.
 *
 * On a local network this has to be the machine's address on that network, not
 * `localhost` -- a link somebody opens on their own laptop has to resolve from
 * there. `APP_URL` exists for exactly this and defaults to localhost only
 * because a default has to be something.
 *
 * `withBasePath` too: this link is read by a mail client, not the router, so
 * nothing prefixes `path` on its own the way `next/link` would.
 */
function link(path: string): string {
  return `${env().APP_URL.replace(/\/$/, "")}${withBasePath(path)}`;
}

export async function inviteMessage(input: {
  toEmail: string;
  toName: string;
  locale: "en" | "fr";
  organizationName: string;
  invitedByName: string;
  token: string;
}): Promise<MailMessage> {
  const t = await getTranslations({ locale: input.locale, namespace: "Mail" });

  return {
    toEmail: input.toEmail,
    toName: input.toName,
    subject: t("inviteSubject", { organization: input.organizationName }),
    body: [
      t("greeting", { name: input.toName }),
      "",
      t("inviteBody", {
        organization: input.organizationName,
        invitedBy: input.invitedByName,
      }),
      "",
      link(`/${input.locale}/accept/${input.token}`),
      "",
      t("inviteExpiry"),
      "",
      t("signature", { organization: input.organizationName }),
    ].join("\n"),
    kind: "invite",
  };
}

export async function resetMessage(input: {
  toEmail: string;
  toName: string;
  locale: "en" | "fr";
  organizationName: string;
  token: string;
}): Promise<MailMessage> {
  const t = await getTranslations({ locale: input.locale, namespace: "Mail" });

  return {
    toEmail: input.toEmail,
    toName: input.toName,
    subject: t("resetSubject"),
    body: [
      t("greeting", { name: input.toName }),
      "",
      t("resetBody"),
      "",
      link(`/${input.locale}/reset/${input.token}`),
      "",
      t("resetExpiry"),
      "",
      t("resetIgnore"),
      "",
      t("signature", { organization: input.organizationName }),
    ].join("\n"),
    kind: "reset",
  };
}
