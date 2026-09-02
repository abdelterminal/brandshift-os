import { getTranslations, setRequestLocale } from "next-intl/server";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export default async function SettingsPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Account");
  return <PagePlaceholder title={t("settings")} />;
}
