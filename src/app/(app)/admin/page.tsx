import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { card, cardPad, PageTitle } from "@/components/ui";
import {
  CreateUserForm,
  DeleteUserButton,
} from "@/modules/admin/admin-controls";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");
  const t = await getDict();

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <PageTitle>{t.modules.admin.label}</PageTitle>
      <section className={`${cardPad} mb-8`}>
        <h2 className="mb-4 text-lg font-semibold text-white">
          {t.admin.addUser}
        </h2>
        <CreateUserForm />
      </section>
      <section className={card}>
        <h2 className="px-4 pt-5 text-lg font-semibold text-white sm:px-6 sm:pt-6">
          {t.admin.users}
        </h2>
        <ul className="divide-y divide-white/[0.06] p-2">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 sm:px-4"
            >
              <span className="font-medium text-zinc-100">{user.name}</span>
              <span className="text-sm text-zinc-500">{user.email}</span>
              {user.role === "ADMIN" && (
                <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                  {t.admin.adminBadge}
                </span>
              )}
              <span className="flex-1" />
              {user.id !== session.user.id && (
                <DeleteUserButton userId={user.id} userName={user.name} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
