import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { exchangeCodeForTokens, fetchSpotifyProfile } from "@/lib/spotify";

/**
 * Spotify redirects back here after the user approves (or denies) access.
 * Exchanges the code for tokens and upserts the caller's SpotifyAccount row.
 * Errors land back on the return page as ?spotify=… for the connect card.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    // Session expired mid-flow — log in again and retry.
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }

  const returnTo = request.cookies.get("spotify_return_to")?.value ?? "/klub100";
  const redirect = (result: "connected" | "denied" | "error") => {
    const url = new URL(returnTo, request.nextUrl);
    url.searchParams.set("spotify", result);
    const response = NextResponse.redirect(url);
    for (const name of ["spotify_pkce_verifier", "spotify_oauth_state", "spotify_return_to"]) {
      response.cookies.delete(name);
    }
    return response;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    // User clicked "cancel" on Spotify's consent screen (or isn't allowlisted).
    return redirect("denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  const verifier = request.cookies.get("spotify_pkce_verifier")?.value;
  const expectedState = request.cookies.get("spotify_oauth_state")?.value;
  if (!code || !verifier || !state || state !== expectedState) {
    return redirect("error");
  }

  try {
    const tokens = await exchangeCodeForTokens(code, verifier);
    if (!tokens.refresh_token) throw new Error("Spotify returned no refresh token");
    const profile = await fetchSpotifyProfile(tokens.access_token);

    const data = {
      spotifyUserId: profile.id,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      product: profile.product,
    };
    await prisma.spotifyAccount.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...data },
      update: data,
    });
    return redirect("connected");
  } catch (e) {
    console.error("Spotify connect failed:", e);
    return redirect("error");
  }
}
