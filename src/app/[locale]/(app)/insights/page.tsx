import { getTranslations } from "next-intl/server";

import { PagePlaceholder } from "@/components/shell/page-placeholder";
import { requirePermission } from "@/lib/auth/guards";

export default async function InsightsPage({ params }: PageProps<"/[locale]">) {
  await params;

  // The rail already hides Insights without the `insights` module flag; this
  // is the other half of the same rule, so typing the URL refuses too. It
  // refuses with a 403, which leaves the session -- and whatever the person
  // was in the middle of -- completely intact.
  await requirePermission("insights.view");

  const t = await getTranslations("Nav");
  return <PagePlaceholder title={t("insights")} />;
}
