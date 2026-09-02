import { getTranslations, setRequestLocale } from "next-intl/server";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export default async function CalendarPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Nav");
  return <PagePlaceholder title={t("calendar")} />;
}
