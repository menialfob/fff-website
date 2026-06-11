import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { modulesForRole } from "@/modules/registry";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  // Middleware guarantees a session, but keep a safe fallback for rendering.
  const role = session?.user?.role ?? "MEMBER";
  const name = session?.user?.name ?? "";

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        {/* Mobile-first: brand + account on the first row, module links on a
            second row that scrolls horizontally instead of overflowing the
            viewport. From sm up everything sits on one row. */}
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 px-4 py-3 sm:flex-nowrap sm:gap-x-6">
          <Link href="/" className="text-lg font-bold">
            FFF
          </Link>
          <div className="order-last -mx-4 mt-2 flex w-[calc(100%+2rem)] gap-4 overflow-x-auto px-4 pb-1 text-sm sm:order-none sm:m-0 sm:w-auto sm:flex-1 sm:overflow-visible sm:p-0">
            {modulesForRole(role).map((m) => (
              <Link
                key={m.id}
                href={m.href}
                className="whitespace-nowrap py-1 text-stone-600 hover:text-stone-900"
              >
                {m.label}
              </Link>
            ))}
          </div>
          <span className="flex-1 sm:hidden" />
          <Link
            href="/profile"
            className="min-w-0 truncate text-sm text-stone-600 hover:text-stone-900"
          >
            {name}
          </Link>
          <form
            className="ml-2 shrink-0 sm:ml-0"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
