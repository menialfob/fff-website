import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadStream } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ songId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { songId } = await params;
  const cheers = await prisma.klub100Cheers.findUnique({ where: { songId } });
  if (!cheers) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(uploadStream(cheers.storedName), {
    headers: {
      "Content-Type": cheers.mimeType,
      "Content-Length": String(cheers.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
