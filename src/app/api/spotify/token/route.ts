import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAccessToken } from "@/lib/spotify";

/**
 * Hands the caller a short-lived access token for *their own* connected
 * Spotify account (refreshing server-side when needed). This is what the
 * Web Playback SDK's getOAuthToken callback fetches — the refresh token
 * never leaves the server.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getUserAccessToken(session.user.id);
  if ("error" in result) {
    const status = result.error === "not-connected" ? 404 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(
    {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt.toISOString(),
      product: result.product,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
