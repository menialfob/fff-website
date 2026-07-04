/**
 * Central registry of feature modules.
 *
 * To add a feature (forum, calendar, …):
 *  1. Create src/modules/<id>/ with its server actions and components.
 *  2. Add its pages under src/app/(app)/<id>/.
 *  3. Register it here and add its `modules.<id>` labels to both i18n
 *     dictionaries, plus a nav icon + accent — the nav and dashboard pick it
 *     up automatically.
 */
export type ModuleId = "files" | "klub100" | "members" | "admin";

export type AppModule = {
  id: ModuleId;
  href: string;
  adminOnly?: boolean;
};

export const modules: AppModule[] = [
  { id: "files", href: "/files" },
  { id: "klub100", href: "/klub100" },
  { id: "members", href: "/members" },
  { id: "admin", href: "/admin", adminOnly: true },
];

export function modulesForRole(role: "ADMIN" | "MEMBER") {
  return modules.filter((m) => !m.adminOnly || role === "ADMIN");
}
