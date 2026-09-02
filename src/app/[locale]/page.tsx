import { redirect } from "@/i18n/navigation";

/**
 * The app opens on Today. There is no separate landing page: someone signing
 * in wants to know what to do next, not to be asked where they would like to
 * go.
 */
export default async function LocaleIndex({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  redirect({ href: "/today", locale });
}
