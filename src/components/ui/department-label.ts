/** Presentation only: duplicate names retain their identity without changing stored data. */
export function departmentLabel<T extends { id: string; name: string }>(department: T, all: T[]) {
  const duplicates = all.filter(item => item.name.trim().toLocaleLowerCase() === department.name.trim().toLocaleLowerCase());
  return duplicates.length > 1 ? `${department.name} · ${department.id.slice(0, 8)}` : department.name;
}
