import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadStream } from "@/lib/storage";

/**
 * The project's own default cheers clip — played before every song that has no
 * cheers of its own. 404 when the project has none; callers fall back to the
 * bundled /default-cheers.wav.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const cheers = await prisma.klub100DefaultCheers.findUnique({
    where: { projectId },
  });
  if (!cheers) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(uploadStream(cheers.storedName), {
    headers: {
      "Content-Type": cheers.mimeType,
      "Content-Length": String(cheers.size),
      // Callers append the clip's version to the URL, so a re-recorded
      // default busts the cache on its own.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
