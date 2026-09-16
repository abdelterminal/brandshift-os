import { redirect } from "@/i18n/navigation";

/**
 * "I have forgotten my password."
 *
 * Self-service is asleep, not removed -- see `KNOWN-GAPS.md`. `ForgotForm`
 * and the `requestReset` action behind it are untouched and still fully
 * wired; only this route is short-circuited, so re-enabling later is a
 * revert of this one redirect. Until then, anybody who lands here is sent to
 * `/login`, where the footer explains the actual way in: ask an admin.
 */
export default async function ForgotPage({ params }: PageProps<"/[locale]/forgot">) {
  const { locale } = await params;
  redirect({ href: "/login", locale });
}
