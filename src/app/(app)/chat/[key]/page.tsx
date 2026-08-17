import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canAccessConversation,
  conversationDisplayName,
  conversationMembers,
  conversationMessages,
  messagesAround,
  MESSAGE_PAGE,
} from "@/modules/chat/data";
import { ConversationView } from "@/modules/chat/channel-view";
import { avatarUrlFor } from "@/components/avatar";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const session = await requireSession();
  const [{ key }, { m: focusMessageId }] = await Promise.all([
    params,
    searchParams,
  ]);

  // Seeded channels are addressed by their stable key (old push URLs like
  // /chat/general keep working); DMs and groups by id.
  const conversation =
    (await prisma.conversation.findUnique({
      where: { key },
      include: { members: { include: { user: { select: { name: true } } } } },
    })) ??
    (await prisma.conversation.findUnique({
      where: { id: key },
      include: { members: { include: { user: { select: { name: true } } } } },
    }));

  const viewer = {
    role: session.user.role,
    extraRoles: session.user.extraRoles,
  };
  const isMember =
    conversation?.members.some((m) => m.userId === session.user.id) ?? false;
  if (!conversation || !canAccessConversation(conversation, viewer, isMember)) {
    notFound();
  }

  // The read cursor must be captured before the client marks the
  // conversation read — it decides where the "new messages" divider goes.
  const [members, read, viewerUser] = await Promise.all([
    conversationMembers(conversation),
    prisma.conversationRead.findUnique({
      where: {
        userId_conversationId: {
          userId: session.user.id,
          conversationId: conversation.id,
        },
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, avatarStoredName: true, avatarUpdatedAt: true },
    }),
  ]);

  // Deep link (?m=<id>, e.g. from a push or search hit): load a window around
  // that message; otherwise the latest page.
  const around = focusMessageId
    ? await messagesAround(conversation.id, focusMessageId)
    : null;
  let messages;
  let hasOlder;
  let hasNewer;
  if (around) {
    ({ messages, hasOlder, hasNewer } = around);
  } else {
    // One extra row tells us whether older history exists beyond the page.
    const page = await conversationMessages(conversation.id, MESSAGE_PAGE + 1);
    hasOlder = page.length > MESSAGE_PAGE;
    messages = hasOlder ? page.slice(1) : page;
    hasNewer = false;
  }

  return (
    <ConversationView
      conversationId={conversation.id}
      conversationName={conversationDisplayName(conversation, session.user.id)}
      conversationType={conversation.type}
      isAdmin={
        conversation.members.some(
          (m) => m.userId === session.user.id && m.isAdmin,
        )
      }
      viewerId={session.user.id}
      viewerName={viewerUser.name}
      viewerAvatarUrl={avatarUrlFor({ id: session.user.id, ...viewerUser })}
      members={members}
      initialMessages={messages}
      initialHasOlder={hasOlder}
      initialHasNewer={hasNewer}
      initialLastReadAt={read?.lastReadAt.toISOString() ?? null}
      focusMessageId={around ? (focusMessageId ?? null) : null}
    />
  );
}
