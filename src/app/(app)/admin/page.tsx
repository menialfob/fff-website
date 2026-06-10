import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  CreateUserForm,
  DeleteUserButton,
} from "@/modules/admin/admin-controls";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Admin</h1>
      <section className="mb-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Add a user</h2>
        <CreateUserForm />
      </section>
      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <h2 className="px-6 pt-6 text-lg font-semibold">Users</h2>
        <ul className="divide-y divide-stone-200 p-2">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
            >
              <span className="font-medium">{user.name}</span>
              <span className="text-sm text-stone-500">{user.email}</span>
              {user.role === "ADMIN" && (
                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium">
                  Admin
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
