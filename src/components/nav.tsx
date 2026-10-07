"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmt } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { CountBadge, moduleAccents } from "@/components/ui";
import { useBadgeCounts } from "@/modules/notifications/app-badge";
import type { ModuleBadgeCounts } from "@/lib/badge";
import {
  CalendarIcon,
  ChatBubblesIcon,
  FolderIcon,
  HomeIcon,
  MessageIcon,
  MusicIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";

export type NavItem = {
  id:
    | "dashboard"
    | "calendar"
    | "forum"
    | "chat"
    | "files"
    | "klub100"
    | "members"
    | "admin";
  href: string;
};

const navIcons: Record<NavItem["id"], (p: { className?: string }) => React.ReactNode> = {
  dashboard: HomeIcon,
  calendar: CalendarIcon,
  forum: MessageIcon,
  chat: ChatBubblesIcon,
  files: FolderIcon,
  klub100: MusicIcon,
  members: UsersIcon,
  admin: ShieldIcon,
};

/** The home screen isn't a module, so it carries no badge of its own. */
function badgeCount(badges: ModuleBadgeCounts, id: NavItem["id"]): number {
  return id === "dashboard" ? 0 : (badges[id] ?? 0);
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Pill links in the sticky header — desktop only. */
export function DesktopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const badges = useBadgeCounts();

  return (
    <div className="hidden items-center gap-1 md:flex">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = navIcons[item.id];
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition ${
              active
                ? "bg-white/10 text-white"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.modules[item.id].label}
            <CountBadge
              count={badgeCount(badges, item.id)}
              accent={moduleAccents[item.id]}
              label={fmt(t.dashboard.recentActivity.badge, {
                count: badgeCount(badges, item.id),
              })}
              className="h-5 min-w-5 px-1 text-[11px]"
            />
          </Link>
        );
      })}
    </div>
  );
}

/** Fixed bottom tab bar — the primary navigation on phones. */
export function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const badges = useBadgeCounts();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto flex max-w-md">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = navIcons[item.id];
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                active ? moduleAccents[item.id].text : "text-zinc-500"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                <CountBadge
                  count={badgeCount(badges, item.id)}
                  accent={moduleAccents[item.id]}
                  label={fmt(t.dashboard.recentActivity.badge, {
                    count: badgeCount(badges, item.id),
                  })}
                  className="absolute -right-3 -top-2 h-[18px] min-w-[18px] px-1 text-[10px] ring-2 ring-canvas"
                />
              </span>
              <span className="truncate">{t.modules[item.id].label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
