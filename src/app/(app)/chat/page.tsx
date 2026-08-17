import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { PageTitle, listCard } from "@/components/ui";
import { conversationSlug, conversationSummaries } from "@/modules/chat/data";

export default async function ChatPage() {
  const session = await requireSession();
  const t = await getDict();
  const summaries = await conversationSummaries(
    { role: session.user.role, extraRoles: session.user.extraRoles },
    session.user.id,
  );

  return (
    <div className="max-w-2xl">
      <PageTitle>{t.modules.chat.label}</PageTitle>
      <div className={listCard}>
        {summaries.map(({ conversation, title, unread, last }) => (
          <Link
            key={conversation.id}
            href={`/chat/${conversationSlug(conversation)}`}
            className="flex items-center gap-3 p-4 transition hover:bg-white/[0.03]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-purple-500 text-lg font-bold text-white">
              {title.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-white">
                  {title}
                </span>
                {unread > 0 && (
                  <span className="ml-auto shrink-0 rounded-full bg-violet-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {unread}
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-zinc-400">
                {last
                  ? `${last.authorName ? `${last.authorName}: ` : ""}${last.preview}`
                  : t.chat.noMessagesYet}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
