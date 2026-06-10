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
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            FFF
          </Link>
          <div className="flex flex-1 gap-4 text-sm">
            {modulesForRole(role).map((m) => (
              <Link
                key={m.id}
                href={m.href}
                className="text-stone-600 hover:text-stone-900"
              >
                {m.label}
              </Link>
            ))}
          </div>
          <Link
            href="/profile"
            className="text-sm text-stone-600 hover:text-stone-900"
          >
            {name}
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
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
