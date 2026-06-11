import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  generateCodeVerifier,
  spotifyAuthorizeUrl,
  spotifyConfigured,
} from "@/lib/spotify";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 600, // the round-trip to Spotify takes seconds, not minutes
} as const;

/**
 * Kicks off the Authorization Code + PKCE flow. The verifier and state are
 * parked in short-lived httpOnly cookies for the callback to verify.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!spotifyConfigured()) {
    return NextResponse.json({ error: "Spotify is not configured" }, { status: 503 });
  }

  // Only same-site paths — never an absolute URL someone pasted into a link.
  const returnToParam = request.nextUrl.searchParams.get("returnTo") ?? "";
  const returnTo =
    returnToParam.startsWith("/") && !returnToParam.startsWith("//")
      ? returnToParam
      : "/klub100";

  const verifier = generateCodeVerifier();
  const state = crypto.randomUUID();

  const response = NextResponse.redirect(spotifyAuthorizeUrl({ state, verifier }));
  response.cookies.set("spotify_pkce_verifier", verifier, COOKIE_OPTS);
  response.cookies.set("spotify_oauth_state", state, COOKIE_OPTS);
  response.cookies.set("spotify_return_to", returnTo, COOKIE_OPTS);
  return response;
}
