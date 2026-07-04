import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildIcs } from "@/modules/calendar/ics";

/**
 * Personal iCal subscription feed. Exempt from the session middleware (see
 * src/middleware.ts) because phone calendar apps cannot log in — the secret
 * token in the URL is the sole authentication. Never add requireSession here.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // Tokens are 32-char base64url strings; cheap sanity check before the
  // database lookup.
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { calendarToken: token },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const events = await prisma.calendarEvent.findMany({
    orderBy: { createdAt: "asc" },
  });
  const ics = buildIcs(events, {
    calendarName: "FFF",
    baseUrl: request.nextUrl.origin,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="fff.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
