import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export type GifSearchResult = {
  id: string;
  previewUrl: string;
  width: number;
  height: number;
};

/**
 * Server-side proxy for Tenor v2 GIF search, so the API key never reaches
 * the client. Only the searching user's browser loads preview media from
 * media.tenor.com; the selected GIF is downloaded and stored locally by
 * sendGif, so recipients never touch Tenor. Degrades to `configured: false`
 * when TENOR_API_KEY is unset (the composer hides the GIF button).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const key = process.env.TENOR_API_KEY;
  if (!key) return NextResponse.json({ configured: false, results: [] });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const pos = url.searchParams.get("pos")?.slice(0, 50) ?? "";

  const endpoint = new URL(
    q
      ? "https://tenor.googleapis.com/v2/search"
      : "https://tenor.googleapis.com/v2/featured",
  );
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("client_key", "fff-website");
  if (q) endpoint.searchParams.set("q", q);
  endpoint.searchParams.set("limit", "24");
  endpoint.searchParams.set("media_filter", "tinygif,gif");
  endpoint.searchParams.set("locale", "da_DK");
  endpoint.searchParams.set("contentfilter", "medium");
  if (pos) endpoint.searchParams.set("pos", pos);

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as {
      results?: {
        id: string;
        media_formats?: {
          tinygif?: { url: string; dims: [number, number] };
        };
      }[];
      next?: string;
    };
    const results: GifSearchResult[] = (data.results ?? [])
      .filter((r) => r.media_formats?.tinygif)
      .map((r) => ({
        id: r.id,
        previewUrl: r.media_formats!.tinygif!.url,
        width: r.media_formats!.tinygif!.dims[0],
        height: r.media_formats!.tinygif!.dims[1],
      }));
    return NextResponse.json({
      configured: true,
      results,
      next: data.next ?? "",
    });
  } catch {
    return NextResponse.json(
      { configured: true, results: [], error: true },
      { status: 502 },
    );
  }
}
