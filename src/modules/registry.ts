/**
 * Central registry of feature modules.
 *
 * To add a feature (forum, calendar, …):
 *  1. Create src/modules/<id>/ with its server actions and components.
 *  2. Add its pages under src/app/(app)/<id>/.
 *  3. Register it here — the nav and dashboard pick it up automatically.
 */
export type AppModule = {
  id: string;
  label: string;
  href: string;
  description: string;
  adminOnly?: boolean;
};

export const modules: AppModule[] = [
  {
    id: "files",
    label: "Files",
    href: "/files",
    description: "Shared photos, videos and documents.",
  },
  {
    id: "klub100",
    label: "Klub 100",
    href: "/klub100",
    description: "Build the 100-song drinking mix together.",
  },
  {
    id: "members",
    label: "Members",
    href: "/members",
    description: "Everyone in the group.",
  },
  {
    id: "admin",
    label: "Admin",
    href: "/admin",
    description: "Manage user accounts.",
    adminOnly: true,
  },
];

export function modulesForRole(role: "ADMIN" | "MEMBER") {
  return modules.filter((m) => !m.adminOnly || role === "ADMIN");
}
