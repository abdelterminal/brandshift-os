import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("signInTitle") };
}

export default async function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const t = await getTranslations("Auth");
  const { next } = await searchParams;

  return (
    <AuthCard
      title={t("signInTitle")}
      subtitle={t("signInSubtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link
            href="/signup"
            className="text-accent-text focus-visible:outline-focus-ring rounded-[4px] font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t("createOne")}
          </Link>
        </>
      }
    >
      <SignInForm next={typeof next === "string" ? next : undefined} />
    </AuthCard>
  );
}
