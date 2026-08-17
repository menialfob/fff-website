import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { PageTitle, listCard } from "@/components/ui";
import { conversationSlug, conversationSummaries } from "@/modules/chat/data";
import { Avatar } from "@/components/avatar";

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
        {summaries.map(({ conversation, title, avatar, unread, last }) => (
          <Link
            key={conversation.id}
            href={`/chat/${conversationSlug(conversation)}`}
            className="flex items-center gap-3 p-4 transition hover:bg-white/[0.03]"
          >
            <Avatar
              id={avatar?.id ?? conversation.id}
              name={avatar?.name ?? title}
              avatarUrl={avatar?.avatarUrl ?? null}
              size="md"
            />
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
