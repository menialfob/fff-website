import Link from "next/link";
import { auth } from "@/lib/auth";
import { modulesForUser, type ModuleId } from "@/modules/registry";
import { fmt, formatDate } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { cardHover, listCard, moduleAccents } from "@/components/ui";
import { getActivitySummary, isSection } from "@/lib/activity";
import {
  CalendarIcon,
  ChatBubblesIcon,
  FolderIcon,
  MessageIcon,
  MusicIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";

const moduleIcons: Record<ModuleId, (p: { className?: string }) => React.ReactNode> = {
  calendar: CalendarIcon,
  forum: MessageIcon,
  chat: ChatBubblesIcon,
  files: FolderIcon,
  klub100: MusicIcon,
  members: UsersIcon,
  admin: ShieldIcon,
};

// Which icon to show for each recent-activity item.
const sectionIcons = {
  forum: MessageIcon,
  calendar: CalendarIcon,
  files: FolderIcon,
} as const;

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role ?? "MEMBER";
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const firstName = session?.user?.name?.split(" ")[0] ?? "";
  const activity = session?.user?.id
    ? await getActivitySummary(session.user.id)
    : null;

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
          const count =
            activity && isSection(m.id) ? activity.counts[m.id] : 0;
          return (
            <Link key={m.id} href={m.href} className={`${cardHover} group relative p-5`}>
              {count > 0 && (
                <span
                  className={`absolute right-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-gradient-to-r ${accent.gradient} px-1.5 text-xs font-bold text-zinc-950 shadow-lg`}
                  aria-label={fmt(t.dashboard.recentActivity.badge, { count })}
                >
                  {count}
                </span>
              )}
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

      {activity && activity.recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-white">
            {t.dashboard.recentActivity.title}
          </h2>
          <ul className={listCard}>
            {activity.recent.map((item, i) => {
              const Icon = sectionIcons[item.section];
              const accent = moduleAccents[item.section];
              const label =
                item.kind === "newFile"
                  ? fmt(t.dashboard.recentActivity.newFile, { name: item.name })
                  : fmt(t.dashboard.recentActivity[item.kind], {
                      title: item.name,
                    });
              return (
                <li key={`${item.href}-${i}`}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.04] sm:px-6"
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${accent.text}`} />
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                      {label}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {formatDate(item.at, locale)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
