import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { modulesForUser } from "@/modules/registry";
import { getDict } from "@/lib/i18n/server";
import { DesktopNav, MobileTabBar, type NavItem } from "@/components/nav";
import { Brand } from "@/components/ui";
import { LogOutIcon } from "@/components/icons";
import { ServiceWorkerRegister } from "@/modules/notifications/service-worker-register";
import { AppBadge } from "@/modules/notifications/app-badge";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  // Middleware guarantees a session, but keep a safe fallback for rendering.
  const role = session?.user?.role ?? "MEMBER";
  const name = session?.user?.name ?? "";
  const t = await getDict();

  const navItems: NavItem[] = [
    { id: "dashboard", href: "/" },
    ...modulesForUser({ role, extraRoles: session?.user?.extraRoles }).map(
      (m) => ({ id: m.id, href: m.href }),
    ),
  ];

  return (
    <div className="min-h-screen">
      <ServiceWorkerRegister />
      <AppBadge />
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-canvas pt-[env(safe-area-inset-top)]">
        <nav className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="shrink-0">
            <Brand />
          </Link>
          <DesktopNav items={navItems} />
          <span className="flex-1" />
          <Link
            href="/profile"
            className="group flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition hover:bg-white/5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/20">
              {name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-32 truncate text-sm font-medium text-zinc-300 group-hover:text-white sm:block">
              {name.split(" ")[0]}
            </span>
          </Link>
          <form
            className="hidden shrink-0 md:block"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              title={t.common.signOut}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
            >
              <LogOutIcon className="h-5 w-5" />
              <span className="sr-only">{t.common.signOut}</span>
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:pt-8 md:pb-12">
        {children}
      </main>
      <MobileTabBar items={navItems} />
    </div>
  );
}
