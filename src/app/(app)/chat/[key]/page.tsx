import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canAccessConversation,
  conversationDisplayName,
  conversationMembers,
  conversationMessages,
} from "@/modules/chat/data";
import { ConversationView } from "@/modules/chat/channel-view";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const session = await requireSession();
  const { key } = await params;

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

  const [messages, members] = await Promise.all([
    conversationMessages(conversation.id),
    conversationMembers(conversation),
  ]);

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
      members={members}
      initialMessages={messages}
    />
  );
}
