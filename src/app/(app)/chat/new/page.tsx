import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { PageTitle } from "@/components/ui";
import { avatarUrlFor } from "@/components/avatar";
import { NewConversation } from "@/modules/chat/new-conversation";

export default async function NewConversationPage() {
  const session = await requireSession();
  const t = await getDict();

  const members = await prisma.user.findMany({
    where: { isActive: true, id: { not: session.user.id } },
    select: {
      id: true,
      name: true,
      avatarStoredName: true,
      avatarUpdatedAt: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-2xl">
      <PageTitle>{t.chat.newConversation}</PageTitle>
      <NewConversation
        members={members.map((m) => ({
          id: m.id,
          name: m.name,
          avatarUrl: avatarUrlFor(m),
        }))}
      />
    </div>
  );
}
