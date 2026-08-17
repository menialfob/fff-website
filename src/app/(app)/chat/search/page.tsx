import { requireSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { PageTitle } from "@/components/ui";
import { ChatSearch } from "@/modules/chat/search";

export default async function ChatSearchPage() {
  await requireSession();
  const t = await getDict();
  return (
    <div className="max-w-2xl">
      <PageTitle>{t.chat.search}</PageTitle>
      <ChatSearch />
    </div>
  );
}
