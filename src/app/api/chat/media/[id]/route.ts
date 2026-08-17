import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadStream } from "@/lib/storage";
import { canAccessConversation, viewerFor } from "@/modules/chat/data";

/**
 * Streams a chat attachment (?v=thumb for the image thumbnail). Access
 * follows the conversation: channel role gates or DM/group membership. A
 * still-pending attachment (no message yet) is visible only to its uploader,
 * so composer previews work before the send.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id },
    include: {
      message: {
        select: {
          conversation: {
            include: {
              members: { where: { userId: session.user.id } },
            },
          },
        },
      },
    },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  if (attachment.message) {
    const conversation = attachment.message.conversation;
    const allowed = canAccessConversation(
      conversation,
      await viewerFor(session.user.id),
      conversation.members.length > 0,
    );
    if (!allowed) return new NextResponse("Not found", { status: 404 });
  } else if (attachment.uploadedById !== session.user.id) {
    // Pending upload: only its owner may preview it.
    return new NextResponse("Not found", { status: 404 });
  }

  const wantThumb = new URL(request.url).searchParams.get("v") === "thumb";
  const storedName =
    wantThumb && attachment.thumbName
      ? attachment.thumbName
      : attachment.storedName;
  const contentType =
    wantThumb && attachment.thumbName ? "image/webp" : attachment.mimeType;

  return new NextResponse(uploadStream(storedName), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
