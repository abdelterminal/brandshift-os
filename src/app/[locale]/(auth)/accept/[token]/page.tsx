import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { checkToken } from "@/lib/auth/tokens";

/**
 * Accepting an invitation.
 *
 * The screen the invite email has been promising since M4 and that did not
 * exist: an invited person was created with an unusable password hash, no
 * token and nowhere to go, so "you get in by invitation" was not true.
 *
 * A bad link is answered specifically -- not valid, already used, expired --
 * because those are three different situations and only one of them means
 * "ask for another". None of them reveals whether an address exists: you
 * cannot reach this page without already holding a token.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Accept");
  return { title: t("title") };
}

export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("Accept");

  const check = await checkToken(token, "invite");

  if (!check.ok) {
    const title =
      check.reason === "used"
        ? t("usedTitle")
        : check.reason === "expired"
          ? t("expiredTitle")
          : t("unknownTitle");

    const body =
      check.reason === "used"
        ? t("usedBody")
        : check.reason === "expired"
          ? t("expiredBody")
          : t("unknownBody");

    return (
      <AuthCard title={title} subtitle={body}>
        <Button size="lg" render={<Link href="/login" />}>
          {t("backToSignIn")}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle", { organization: check.organizationName })}>
      <SetPasswordForm token={token} purpose="invite" />
    </AuthCard>
  );
}
