import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { checkToken } from "@/lib/auth/tokens";

/**
 * Choosing a new password from a reset link.
 *
 * The same shape as accepting an invitation, and deliberately so: both prove
 * you can read an address and then set a password. The only difference is the
 * purpose checked against the token -- which is checked here rather than taken
 * from the URL, so an expired invite cannot be spent as a reset.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Accept");
  return { title: t("resetTitle") };
}

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("Accept");

  const check = await checkToken(token, "reset");

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
        <Button size="lg" render={<Link href="/forgot" />}>
          {t("backToSignIn")}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("resetTitle")} subtitle={t("resetSubtitle", { email: check.email })}>
      <SetPasswordForm token={token} purpose="reset" />
    </AuthCard>
  );
}
