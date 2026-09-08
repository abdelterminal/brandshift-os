"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { departmentLabel } from "@/components/ui/department-label";
import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import type { DepartmentRow } from "@/lib/data/people";
import { cn } from "@/lib/utils";

/**
 * Filters that live in the URL.
 *
 * Filtering is a place someone can be, not a hidden mode: the state is in the
 * query string, so a filtered list can be linked to, reloaded, and gone back
 * to. It also means the server does the filtering, which is what keeps the
 * screen honest as the data grows.
 */

const STATUSES = ["planning", "active", "on_hold", "completed"] as const;

export function ProjectFilters({ departments }: { departments: DepartmentRow[] }) {
  const t = useTranslations("Work");
  const statusLabels = useTranslations("ProjectStatus");
  const ui = useTranslations("Ui");
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = {
    q: searchParams.get("q") ?? "",
    status: searchParams.get("status") ?? "",
    department: searchParams.get("department") ?? "",
  };

  function apply(next: Partial<typeof current>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  const hasFilters = Boolean(current.q || current.status || current.department);

  const selectClass = cn(
    "h-9 min-w-0 max-w-full rounded-control border px-2.5 text-body",
    "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
    focusRing,
    transition,
  );

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={pending || undefined}>
      <Button className="md:hidden" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{ui("filters")} ({Object.values(current).filter(Boolean).length})</Button>
      <div className={cn("w-full flex-wrap items-center gap-2 md:flex", expanded ? "flex" : "hidden")}>
      <form
        action={(formData) => apply({ q: String(formData.get("q") ?? "") })}
        className="flex w-full min-w-0 items-center sm:w-auto sm:flex-1 sm:max-w-72"
      >
        <label htmlFor="project-search" className="sr-only">
          {t("searchProjects")}
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
            id="project-search"
            name="q"
            defaultValue={current.q}
            placeholder={t("searchProjects")}
            className="text-body text-fg-default placeholder:text-fg-subtle min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
      </form>

      <label htmlFor="project-status" className="sr-only">
        {t("status")}
      </label>
      <select
        id="project-status"
        value={current.status}
        onChange={(event) => apply({ status: event.target.value })}
        className={selectClass}
      >
        <option value="">{t("allStatuses")}</option>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {statusLabels(status)}
          </option>
        ))}
      </select>

      <label htmlFor="project-department" className="sr-only">
        {t("department")}
      </label>
      <select
        id="project-department"
        value={current.department}
        onChange={(event) => apply({ department: event.target.value })}
        className={selectClass}
      >
        <option value="">{t("allDepartments")}</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {departmentLabel(department, departments)}
          </option>
        ))}
      </select>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => apply({ q: "", status: "", department: "" })}
        >
          <X aria-hidden className="size-4" />
          {ui("clearFilters")}
        </Button>
      ) : null}
      </div>
    </div>
  );
}
