import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * 404 -- there is nothing at this address.
 *
 * It says explicitly that the account is fine, because the two ways people
 * arrive here both invite the opposite conclusion: a stale link somebody sent
 * them, and a deleted record. Neither is their fault, and a bare "404" leaves
 * them guessing which of the two it was and whether they have been locked out.
 *
 * Shared with `ForbiddenNotice` for the same reason: `(app)` renders it inside
 * the shell so there is still a rail to leave by, and `(print)` renders it
 * bare, having no shell to put it in.
 */
export async function NotFoundNotice() {
  const t = await getTranslations("Errors");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <h1 className="text-heading-lg font-display text-fg-default">{t("notFoundTitle")}</h1>
      <p className="text-body text-fg-muted mt-2">{t("notFoundBody")}</p>
      <Button render={<Link href="/today" />} variant="secondary" size="lg" className="mt-6">
        {t("backToToday")}
      </Button>
    </div>
  );
}
