import { getTranslations } from "next-intl/server";

import { SignOutOnMount } from "@/components/auth/sign-out-on-mount";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * 401 -- we do not know who you are.
 *
 * The session is gone, so the cookie goes too. Reaching this page means a
 * signed cookie survived the middleware but failed the full check: expired,
 * revoked from another device, or invalidated by a password change.
 */
export default async function Unauthorized() {
  const t = await getTranslations("Errors");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <SignOutOnMount />
      <h1 className="text-heading-lg font-display text-fg-default">{t("unauthorizedTitle")}</h1>
      <p className="text-body text-fg-muted mt-2">{t("unauthorizedBody")}</p>
      <Button render={<Link href="/login" />} variant="primary" size="lg" className="mt-6">
        {t("goToSignIn")}
      </Button>
    </div>
  );
}
