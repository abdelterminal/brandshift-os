import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ForcedPasswordChangeForm } from "@/components/auth/change-password-form";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * "Somebody else chose your password. Choose your own."
 *
 * Where `requireUser()` sends anybody carrying `mustChangePassword`, which an
 * admin sets by handing them a password on their People page. They are signed
 * in -- this is not a second authentication -- but every other page bounces
 * back here until they have picked one, so the copy the admin read aloud stops
 * working the moment it has been used for its one purpose.
 *
 * This is the one page that reads the session with `getCurrentUser()` rather
 * than `requireUser()`, and it has to be: the guard's whole job is to redirect
 * here, so calling it here would be a loop. Signed out, it falls through to
 * `/login` like any other page would.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Auth");
  return { title: t("newPasswordTitle") };
}

// Params typed by hand rather than through `PageProps`, the same way
// `ResetPage` does: the generated route types do not exist until a build has
// seen this file, and a type check should not depend on having run one.
export default async function NewPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getCurrentUser();

  // `redirect()` is not typed as `never` here, so each of these returns rather
  // than relying on narrowing.
  if (!session) {
    redirect({ href: "/login", locale });
    return null;
  }

  // Nothing outstanding: they arrived by typing the URL, or finished in
  // another tab. Either way there is nothing here for them.
  if (!session.user.mustChangePassword) {
    redirect({ href: "/today", locale });
    return null;
  }

  const t = await getTranslations("Auth");

  return (
    <AuthCard
      title={t("newPasswordTitle")}
      subtitle={t("newPasswordSubtitle", { email: session.user.email })}
    >
      <ForcedPasswordChangeForm />
    </AuthCard>
  );
}
