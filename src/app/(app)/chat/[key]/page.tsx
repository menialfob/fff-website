import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canAccessChannel,
  channelMembers,
  channelMessages,
} from "@/modules/chat/data";
import { ChannelView } from "@/modules/chat/channel-view";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const session = await requireSession();
  const { key } = await params;

  const channel = await prisma.channel.findUnique({ where: { key } });
  const viewer = {
    role: session.user.role,
    extraRoles: session.user.extraRoles,
  };
  if (!channel || !canAccessChannel(channel, viewer)) notFound();

  const [messages, members] = await Promise.all([
    channelMessages(channel.id),
    channelMembers(channel),
  ]);

  return (
    <ChannelView
      channelId={channel.id}
      channelName={channel.name}
      viewerId={session.user.id}
      members={members}
      initialMessages={messages}
    />
  );
}
