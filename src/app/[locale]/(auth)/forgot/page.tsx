import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forgot-form";
import { Link } from "@/i18n/navigation";

/**
 * "I have forgotten my password."
 *
 * Reachable without a session, obviously, and the last piece of a chain whose
 * other parts already existed: the token, the transport and the screen that
 * spends it were all built with invitations and tested. This is the form that
 * mints one.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Forgot");
  return { title: t("title") };
}

export default async function ForgotPage() {
  const t = await getTranslations("Forgot");
  const auth = await getTranslations("Auth");

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <Link
          href="/login"
          className="text-accent-text focus-visible:outline-focus-ring rounded-[4px] font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {auth("signIn")}
        </Link>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
