import { getTranslations } from "next-intl/server";

import { NewProjectWizard } from "@/components/work/new-project-wizard";
import { hasModule } from "@/lib/authz";
import { requirePermission } from "@/lib/auth/guards";
import { listCompanies } from "@/lib/data/crm";
import { listAssignablePeople } from "@/lib/data/people";
import { listDepartments } from "@/lib/data/people";
import { listOpenTasks, organizationToday, workloadFrom } from "@/lib/data/tasks";

/**
 * Creating a project is a manager's job, so the page refuses anyone else with
 * a 403 rather than hiding the button and letting the URL through.
 */
export default async function NewProjectPage() {
  const session = await requirePermission("project.create");

  const [t, departments, people, openTasks, companies] = await Promise.all([
    getTranslations("NewProject"),
    listDepartments(session.actor),
    listAssignablePeople(session.actor),
    listOpenTasks(session.actor),
    hasModule(session.actor, "crm") ? listCompanies(session.actor) : Promise.resolve([]),
  ]);

  const workload = workloadFrom(openTasks, organizationToday());

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <h1 className="text-display font-display text-fg-default mb-6">{t("title")}</h1>

      <NewProjectWizard
        departments={departments.map((department) => ({
          id: department.id,
          name: department.name,
        }))}
        companies={companies.map((company) => ({ id: company.id, name: company.name }))}
        people={people.map((person) => ({
          userId: person.userId,
          name: person.name,
          avatarUrl: person.avatarUrl,
          departmentId: person.departmentId,
          open: workload.get(person.userId)?.open ?? 0,
          overdue: workload.get(person.userId)?.overdue ?? 0,
        }))}
      />
    </div>
  );
}
