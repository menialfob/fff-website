import Link from "next/link";
import { auth } from "@/lib/auth";
import { modulesForUser, type ModuleId } from "@/modules/registry";
import { fmt } from "@/lib/i18n";
import { getDict } from "@/lib/i18n/server";
import { cardHover, moduleAccents } from "@/components/ui";
import {
  CalendarIcon,
  FolderIcon,
  MessageIcon,
  MusicIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";

const moduleIcons: Record<ModuleId, (p: { className?: string }) => React.ReactNode> = {
  calendar: CalendarIcon,
  forum: MessageIcon,
  files: FolderIcon,
  klub100: MusicIcon,
  members: UsersIcon,
  admin: ShieldIcon,
};

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role ?? "MEMBER";
  const t = await getDict();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {fmt(t.dashboard.greeting, { name: firstName })}{" "}
        <span aria-hidden>👋</span>
      </h1>
      <p className="mb-8 mt-2 text-zinc-400">{t.dashboard.welcomeBack}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modulesForUser({ role, extraRoles: session?.user?.extraRoles }).map((m) => {
          const Icon = moduleIcons[m.id];
          const accent = moduleAccents[m.id];
          return (
            <Link key={m.id} href={m.href} className={`${cardHover} group p-5`}>
              <span
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${accent.gradient} text-white shadow-lg transition group-hover:scale-105`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mb-1 text-lg font-semibold text-white">
                {t.modules[m.id].label}
              </h2>
              <p className="text-sm text-zinc-400">
                {t.modules[m.id].description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
