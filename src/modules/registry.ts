import type { ExtraRole } from "@/lib/roles";

/**
 * Central registry of feature modules.
 *
 * To add a feature (forum, calendar, …):
 *  1. Create src/modules/<id>/ with its server actions and components.
 *  2. Add its pages under src/app/(app)/<id>/.
 *  3. Register it here and add its `modules.<id>` labels to both i18n
 *     dictionaries, plus a nav icon + accent — the nav and dashboard pick it
 *     up automatically.
 *
 * Access control: `adminOnly` limits a module to site admins. `requiredRole`
 * limits it to holders of an extra role (e.g. a future bestyrelse-only area
 * registers with `requiredRole: "BESTYRELSE"` and guards its server actions
 * with `requireRole("BESTYRELSE")` from src/lib/auth). Admins see everything.
 */
export type ModuleId =
  | "calendar"
  | "forum"
  | "chat"
  | "files"
  | "klub100"
  | "members"
  | "admin";

export type AppModule = {
  id: ModuleId;
  href: string;
  adminOnly?: boolean;
  requiredRole?: ExtraRole;
};

export const modules: AppModule[] = [
  // Visible to everyone; recurring-event writes are gated to
  // ADMIN/BESTYRELSE inside the module's server actions.
  { id: "calendar", href: "/calendar" },
  // Discussion forum. The seeded "Begivenheder" section mirrors calendar
  // events; ordinary sections are member-created content.
  { id: "forum", href: "/forum" },
  // Real-time chat: group channels, reactions, polls, push notifications.
  { id: "chat", href: "/chat" },
  { id: "files", href: "/files" },
  { id: "klub100", href: "/klub100" },
  { id: "members", href: "/members" },
  { id: "admin", href: "/admin", adminOnly: true },
];

export function modulesForUser(user: {
  role: "ADMIN" | "MEMBER";
  extraRoles?: ExtraRole[];
}) {
  return modules.filter((m) => {
    if (user.role === "ADMIN") return true;
    if (m.adminOnly) return false;
    if (m.requiredRole) return user.extraRoles?.includes(m.requiredRole) ?? false;
    return true;
  });
}
