"use client";

import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SPOTIFY_ALLOWLIST_SLOTS } from "./shared";
import { disconnectSpotify } from "./spotify-actions";

export type SpotifyConnection = {
  configured: boolean;
  connected: boolean;
  /** "premium" | "free" | … | null while unknown */
  product: string | null;
  /** Connected accounts site-wide ≈ dashboard allowlist slots in use. */
  slotsUsed: number;
};

/**
 * The "Connect Spotify" card. Honest about the dev-mode limits: 5 allowlist
 * slots total, Premium required to host, and connecting is only needed by
 * whoever hosts playback.
 */
export function SpotifyConnectCard({ connection }: { connection: SpotifyConnection }) {
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Feedback from the OAuth round-trip (?spotify=connected|denied|error),
  // dismissable so it doesn't stick around while browsing.
  const [dismissed, setDismissed] = useState(false);
  const flowResult = dismissed ? null : searchParams.get("spotify");

  if (!connection.configured) return null;

  const { connected, product, slotsUsed } = connection;
  const premium = product === "premium";

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold">Spotify</h2>
        {connected ? (
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
            ✓ Connected{product ? ` · ${premium ? "Premium" : product}` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-stone-300 px-3 py-1 text-sm text-stone-600">
            Not connected
          </span>
        )}
        <span className="flex-1" />
        {connected ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => void (await disconnectSpotify()))}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <a
            href={`/api/spotify/login?returnTo=${encodeURIComponent(pathname)}`}
            className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Connect Spotify
          </a>
        )}
      </div>

      {flowResult === "connected" && (
        <ResultNote tone="ok" onDismiss={() => setDismissed(true)}>
          Spotify connected.
        </ResultNote>
      )}
      {flowResult === "denied" && (
        <ResultNote tone="error" onDismiss={() => setDismissed(true)}>
          Spotify access was denied. If you didn&apos;t cancel on purpose, your
          Spotify account probably isn&apos;t on the app&apos;s allowlist yet —
          ask in the group chat.
        </ResultNote>
      )}
      {flowResult === "error" && (
        <ResultNote tone="error" onDismiss={() => setDismissed(true)}>
          Connecting to Spotify failed — try again, and check the server logs
          if it keeps happening.
        </ResultNote>
      )}

      {connected && !premium && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your Spotify account is connected but isn&apos;t Premium — hosting
          playback requires Premium. You can still do everything else.
        </p>
      )}

      <p className="mt-3 text-sm text-stone-600">
        Connecting is only needed to <strong>host</strong> a Klub 100 playback
        on your device — suggesting, voting and cheers need no Spotify account.
        Hosting requires Spotify <strong>Premium</strong>, and our app may have
        at most {SPOTIFY_ALLOWLIST_SLOTS} connected accounts ({slotsUsed}/
        {SPOTIFY_ALLOWLIST_SLOTS} slot{slotsUsed === 1 ? "" : "s"} in use) —
        coordinate in the group chat before connecting.
      </p>
    </section>
  );
}

function ResultNote({
  tone,
  onDismiss,
  children,
}: {
  tone: "ok" | "error";
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <p
      role="alert"
      className={`mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
        tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
      }`}
    >
      <span className="flex-1">{children}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="font-bold">
        ×
      </button>
    </p>
  );
}
