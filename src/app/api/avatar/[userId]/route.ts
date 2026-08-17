import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadStream } from "@/lib/storage";

/**
 * Streams a member's profile picture. Auth-gated like every upload; cached
 * privately and immutably — the URL carries ?v=<avatarUpdatedAt> (see
 * avatarUrlFor), so a re-upload changes the URL instead of invalidating.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarStoredName: true },
  });
  if (!user?.avatarStoredName) {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(uploadStream(user.avatarStoredName), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
