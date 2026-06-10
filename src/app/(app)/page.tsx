import Link from "next/link";
import { auth } from "@/lib/auth";
import { modulesForRole } from "@/modules/registry";

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role ?? "MEMBER";

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">
        Hi, {session?.user?.name?.split(" ")[0]}
      </h1>
      <p className="mb-8 text-stone-600">Welcome back.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modulesForRole(role).map((m) => (
          <Link
            key={m.id}
            href={m.href}
            className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <h2 className="mb-1 text-lg font-semibold">{m.label}</h2>
            <p className="text-sm text-stone-600">{m.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
