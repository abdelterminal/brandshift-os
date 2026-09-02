import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("signUpTitle") };
}

export default async function SignUpPage() {
  const t = await getTranslations("Auth");

  return (
    <AuthCard
      title={t("signUpTitle")}
      subtitle={t("signUpSubtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link
            href="/login"
            className="text-accent-text focus-visible:outline-focus-ring rounded-[4px] font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t("signInInstead")}
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
