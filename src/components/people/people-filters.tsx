"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import type { DepartmentRow } from "@/lib/data/people";
import { cn } from "@/lib/utils";

/** Directory filters, held in the URL so a filtered view can be shared. */
export function PeopleFilters({ departments }: { departments: DepartmentRow[] }) {
  const t = useTranslations("People");
  const roles = useTranslations("Roles");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = {
    q: searchParams.get("q") ?? "",
    role: searchParams.get("role") ?? "",
    department: searchParams.get("department") ?? "",
  };

  function apply(next: Partial<typeof current>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Any filter change puts you back on the first page; page 4 of a different
    // result set is almost never where you meant to be.
    params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const selectClass = cn(
    "h-9 rounded-control border px-2.5 text-body",
    "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
    focusRing,
    transition,
  );

  const hasFilters = Boolean(current.q || current.role || current.department);

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={pending || undefined}>
      <form
        action={(formData) => apply({ q: String(formData.get("q") ?? "") })}
        className="flex min-w-0 flex-1 items-center sm:max-w-72"
      >
        <label htmlFor="people-search" className="sr-only">
          {t("search")}
        </label>
        <div
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-control border px-3",
            "bg-surface-raised border-border-control hover:border-border-hover",
            "has-focus-visible:outline-focus-ring has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
            transition,
          )}
        >
          <Search aria-hidden className="text-fg-subtle size-4 shrink-0" />
          <input
            id="people-search"
            name="q"
            defaultValue={current.q}
            placeholder={t("search")}
            className="text-body text-fg-default placeholder:text-fg-subtle min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
      </form>

      <label htmlFor="people-role" className="sr-only">
        {t("role")}
      </label>
      <select
        id="people-role"
        value={current.role}
        onChange={(event) => apply({ role: event.target.value })}
        className={selectClass}
      >
        <option value="">{t("allRoles")}</option>
        {(["owner", "admin", "manager", "member"] as const).map((role) => (
          <option key={role} value={role}>
            {roles(role)}
          </option>
        ))}
      </select>

      <label htmlFor="people-department" className="sr-only">
        {t("department")}
      </label>
      <select
        id="people-department"
        value={current.department}
        onChange={(event) => apply({ department: event.target.value })}
        className={selectClass}
      >
        <option value="">{t("allDepartments")}</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => apply({ q: "", role: "", department: "" })}>
          <X aria-hidden className="size-4" />
          {t("allRoles")}
        </Button>
      ) : null}
    </div>
  );
}
