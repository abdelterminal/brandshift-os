import { getTranslations } from "next-intl/server";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { OutboxPanel } from "@/components/auth/outbox-panel";
import { SessionsPanel } from "@/components/auth/sessions-panel";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { listSessions } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { listOutbox } from "@/lib/mail/transport";

export default async function SettingsPage() {
  const session = await requireUser();
  // The outbox is behind `member.invite`: its bodies carry links that set
  // passwords, so it is not for everyone who can reach Settings.
  const maySeeOutbox = can(session.actor, "member.invite");

  const [t, devices, outbox] = await Promise.all([
    getTranslations("Account"),
    listSessions(session.user.id, session.session.id),
    maySeeOutbox ? listOutbox(session.actor) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <h1 className="text-display font-display text-fg-default">{t("settings")}</h1>

      <div className="mt-6 flex flex-col gap-4">
        <SessionsPanel devices={devices} />
        <ChangePasswordForm />
        {maySeeOutbox ? <OutboxPanel rows={outbox} sending={env().MAIL_DRIVER === "smtp"} /> : null}
      </div>
    </div>
  );
}
