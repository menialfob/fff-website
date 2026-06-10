import { prisma } from "@/lib/db";

export default async function MembersPage() {
  const members = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, bio: true, createdAt: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Members</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {members.map((member) => (
          <li
            key={member.id}
            className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-900 font-semibold text-white">
                {member.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <h2 className="font-semibold">{member.name}</h2>
                <p className="text-xs text-stone-500">
                  Joined {member.createdAt.toLocaleDateString("en-GB")}
                </p>
              </div>
            </div>
            {member.bio && (
              <p className="text-sm text-stone-600">{member.bio}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
