import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * 403 -- we know who you are, and the answer is no.
 *
 * Nothing is cleared. The session survives untouched, because losing your
 * work for clicking the wrong link is a punishment, not a security measure.
 */
export default async function Forbidden() {
  const t = await getTranslations("Errors");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <h1 className="text-heading-lg font-display text-fg-default">{t("forbiddenTitle")}</h1>
      <p className="text-body text-fg-muted mt-2">{t("forbiddenBody")}</p>
      <Button render={<Link href="/today" />} variant="secondary" size="lg" className="mt-6">
        {t("backToToday")}
      </Button>
    </div>
  );
}
