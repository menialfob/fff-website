import type { BestyrelseTitle } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fmt, formatDate, type Dictionary } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { card, PageTitle } from "@/components/ui";

/**
 * One badge per member: their elected title if they have one, otherwise a
 * plain "Bestyrelse" badge for untitled board members, otherwise nothing.
 */
function MemberBadge({
  bestyrelse,
  t,
}: {
  bestyrelse?: { title: BestyrelseTitle | null };
  t: Dictionary;
}) {
  if (!bestyrelse) return null;
  const [text, colors] = bestyrelse.title
    ? [
        t.common.bestyrelseTitles[bestyrelse.title],
        "border-amber-400/30 bg-amber-400/10 text-amber-300",
      ]
    : [t.common.bestyrelse, "border-sky-400/30 bg-sky-400/10 text-sky-300"];
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors}`}
    >
      {text}
    </span>
  );
}

/** Stable, friendly gradient per member — derived from their id. */
const avatarGradients = [
  "from-amber-400 to-orange-500",
  "from-sky-400 to-cyan-500",
  "from-fuchsia-500 to-pink-500",
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-indigo-500",
  "from-rose-400 to-red-500",
];

function gradientFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return avatarGradients[hash % avatarGradients.length];
}

export default async function MembersPage() {
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const members = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      bio: true,
      createdAt: true,
      extraRoles: { select: { role: true, title: true } },
    },
  });

  return (
    <div>
      <PageTitle>{t.modules.members.label}</PageTitle>
      <ul className="grid gap-4 sm:grid-cols-2">
        {members.map((member) => (
          <li key={member.id} className={`${card} p-5`}>
            <div className="mb-2 flex items-center gap-3">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(member.id)} font-bold text-white shadow-lg`}
              >
                {member.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 font-semibold text-white">
                  {member.name}
                  <MemberBadge
                    bestyrelse={member.extraRoles.find(
                      (r) => r.role === "BESTYRELSE",
                    )}
                    t={t}
                  />
                </h2>
                <p className="text-xs text-zinc-500">
                  {fmt(t.members.joined, {
                    date: formatDate(member.createdAt, locale),
                  })}
                </p>
              </div>
            </div>
            {member.bio && <p className="text-sm text-zinc-400">{member.bio}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
