import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { TourReplay } from "@/components/shell/tour-replay";
import { ProfileForm } from "@/components/account/profile-form";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { focusRing, quietLinkHover, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getPerson } from "@/lib/data/people";
import { cn } from "@/lib/utils";

/**
 * You, here.
 *
 * Two halves, and the split is the point. What you may change about yourself
 * -- your name, your job title, the language the app speaks -- and what you may
 * not: your role, your permissions, your department, your leave allowance.
 * Those are terms of employment rather than preferences, and a person who can
 * grant themselves the `finance` flag is not a permission system.
 *
 * The second half is shown rather than hidden. Somebody looking for their role
 * or their allowance should find it and see that it is not theirs to set, not
 * wonder where it went.
 *
 * Devices and passwords live in Settings, next door, and are not repeated.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Account");
  return { title: t("profile") };
}

const MODULE_KEYS = ["finance", "people", "crm", "insights"] as const;

export default async function ProfilePage() {
  const session = await requireUser();

  const [t, account, roles, format, person] = await Promise.all([
    getTranslations("Profile"),
    getTranslations("Account"),
    getTranslations("Roles"),
    getFormatter(),
    getPerson(session.actor, session.actor.userId),
  ]);

  // Your own membership always exists -- `requireUser` would have refused
  // otherwise -- so this is a guard against a race, not an expected state.
  if (!person) notFound();

  const modules = MODULE_KEYS.filter((key) => session.actor.permissions[key]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex items-center gap-4">
        <PersonAvatar name={person.name} src={person.avatarUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{account("profile")}</h1>
          <p className="text-body text-fg-muted mt-1">{person.email}</p>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("aboutYou")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm
              name={person.name}
              jobTitle={person.jobTitle}
              locale={session.user.locale ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("inThisOrganization")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-caption text-fg-muted mb-4">{t("setByAdmin")}</p>

            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-caption text-fg-muted">{t("role")}</dt>
                <dd className="text-body text-fg-default mt-0.5">{roles(person.role)}</dd>
              </div>

              <div>
                <dt className="text-caption text-fg-muted">{t("department")}</dt>
                <dd className="text-body text-fg-default mt-0.5">
                  {person.departmentName ?? t("noDepartment")}
                </dd>
              </div>

              <div>
                <dt className="text-caption text-fg-muted">{t("joined")}</dt>
                <dd className="text-body text-fg-default mt-0.5">
                  {person.joinedAt
                    ? format.dateTime(person.joinedAt, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "—"}
                </dd>
              </div>

              <div>
                <dt className="text-caption text-fg-muted">{t("modules")}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {modules.length === 0 ? (
                    <span className="text-body text-fg-muted">{t("noModules")}</span>
                  ) : (
                    modules.map((key) => (
                      <Badge key={key} tone="neutral">
                        {t(key)}
                      </Badge>
                    ))
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("elsewhere")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {[
                { href: `/people/${person.userId}`, label: t("yourDirectoryPage") },
                { href: "/leave", label: t("yourTimeOff") },
                { href: "/settings", label: t("devicesAndPassword") },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "text-body text-accent-text rounded-[6px] underline underline-offset-2",
                      quietLinkHover,
                      focusRing,
                      transition,
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <TourReplay />
    </div>
  );
}
