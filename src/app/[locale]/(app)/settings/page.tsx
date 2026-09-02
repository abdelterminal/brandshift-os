import { getTranslations } from "next-intl/server";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SessionsPanel } from "@/components/auth/sessions-panel";
import { requireUser } from "@/lib/auth/guards";
import { listSessions } from "@/lib/auth/session";

export default async function SettingsPage() {
  const session = await requireUser();
  const [t, devices] = await Promise.all([
    getTranslations("Account"),
    listSessions(session.user.id, session.session.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <h1 className="text-display font-display text-fg-default">{t("settings")}</h1>

      <div className="mt-6 flex flex-col gap-4">
        <SessionsPanel devices={devices} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
