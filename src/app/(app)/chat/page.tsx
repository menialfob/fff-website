import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { PageTitle, btnPrimary, listCard } from "@/components/ui";
import { conversationSummaries, viewerFor } from "@/modules/chat/data";
import { ConversationList } from "@/modules/chat/conversation-list";

export default async function ChatPage() {
  const session = await requireSession();
  const t = await getDict();
  const summaries = await conversationSummaries(
    await viewerFor(session.user.id),
    session.user.id,
  );

  return (
    <div className="max-w-2xl">
      <PageTitle
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/chat/search"
              aria-label={t.chat.search}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] text-lg text-zinc-300 transition hover:border-white/20"
            >
              🔍
            </Link>
            <Link href="/chat/new" className={btnPrimary}>
              {t.chat.newConversation}
            </Link>
          </div>
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
