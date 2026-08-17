import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { PageTitle, btnPrimary, listCard } from "@/components/ui";
import { conversationSummaries } from "@/modules/chat/data";
import { ConversationList } from "@/modules/chat/conversation-list";

export default async function ChatPage() {
  const session = await requireSession();
  const t = await getDict();
  const summaries = await conversationSummaries(
    { role: session.user.role, extraRoles: session.user.extraRoles },
    session.user.id,
  );

  return (
    <div className="max-w-2xl">
      <PageTitle
        actions={
          <Link href="/chat/new" className={btnPrimary}>
            {t.chat.newConversation}
          </Link>
        }
      >
        {t.modules.chat.label}
      </PageTitle>
      <div className={listCard}>
        <ConversationList initial={summaries} viewerId={session.user.id} />
      </div>
    </div>
  );
}
