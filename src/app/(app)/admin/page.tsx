import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { card, cardPad, mutedText, PageTitle } from "@/components/ui";
import { AdminTabs } from "@/modules/admin/admin-tabs";
import { CreateUserForm, UserRow } from "@/modules/admin/admin-controls";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const [users, fileStats, songStats, cheersStats] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: { extraRoles: true },
    }),
    prisma.fileItem.groupBy({
      by: ["uploadedById"],
      _count: true,
      _sum: { size: true },
    }),
    prisma.klub100Song.groupBy({ by: ["suggestedById"], _count: true }),
    prisma.klub100Cheers.groupBy({ by: ["recordedById"], _count: true }),
  ]);

  const files = new Map(
    fileStats.map((s) => [
      s.uploadedById,
      { count: s._count, bytes: s._sum.size ?? 0 },
    ]),
  );
  const songs = new Map(songStats.map((s) => [s.suggestedById, s._count]));
  const cheers = new Map(cheersStats.map((s) => [s.recordedById, s._count]));

  return (
    <div>
      <PageTitle>{t.modules.admin.label}</PageTitle>
      <AdminTabs active="users" />
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
            <UserRow
              key={user.id}
              user={{
                id: user.id,
                name: user.name,
                email: user.email,
                isAdmin: user.role === "ADMIN",
                isActive: user.isActive,
                extraRoles: user.extraRoles.map((r) => r.role),
                bestyrelseTitle:
                  user.extraRoles.find((r) => r.role === "BESTYRELSE")?.title ??
                  null,
              }}
              stats={{
                files: files.get(user.id)?.count ?? 0,
                bytes: files.get(user.id)?.bytes ?? 0,
                songs: songs.get(user.id) ?? 0,
                cheers: cheers.get(user.id) ?? 0,
              }}
              isSelf={user.id === session.user.id}
              lastLogin={
                user.lastLoginAt
                  ? formatDateTime(user.lastLoginAt, locale)
                  : null
              }
            />
          ))}
        </ul>
      </section>
      <p className={`${mutedText} mt-4 text-sm`}>{t.admin.staleSessionHint}</p>
    </div>
  );
}
