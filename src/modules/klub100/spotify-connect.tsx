"use client";

import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { btnSpotify, cardPad, linkDanger } from "@/components/ui";
import { XIcon } from "@/components/icons";
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
export function SpotifyConnectCard({
  connection,
}: {
  connection: SpotifyConnection;
}) {
  const { t, fmt } = useI18n();
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
    <section className={cardPad}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold text-white">
          {t.klub100.spotify}
        </h2>
        {connected ? (
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-300">
            ✓ {t.klub100.connected}
            {product ? ` · ${premium ? "Premium" : product}` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-zinc-400">
            {t.klub100.notConnected}
          </span>
        )}
        <span className="flex-1" />
        {connected ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => void (await disconnectSpotify()))
            }
            className={linkDanger}
          >
            {t.klub100.disconnect}
          </button>
        ) : (
          <a
            href={`/api/spotify/login?returnTo=${encodeURIComponent(pathname)}`}
            className={btnSpotify}
          >
            {t.klub100.connect}
          </a>
        )}
      </div>

      {flowResult === "connected" && (
        <ResultNote tone="ok" onDismiss={() => setDismissed(true)}>
          {t.klub100.spotifyConnectedNote}
        </ResultNote>
      )}
      {flowResult === "denied" && (
        <ResultNote tone="error" onDismiss={() => setDismissed(true)}>
          {t.klub100.spotifyDeniedNote}
        </ResultNote>
      )}
      {flowResult === "error" && (
        <ResultNote tone="error" onDismiss={() => setDismissed(true)}>
          {t.klub100.spotifyErrorNote}
        </ResultNote>
      )}

      {connected && !premium && (
        <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          {t.klub100.premiumWarning}
        </p>
      )}

      <p className="mt-3 text-sm text-zinc-400">
        {fmt(t.klub100.slotsInfo, {
          max: SPOTIFY_ALLOWLIST_SLOTS,
          used: slotsUsed,
        })}
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
  const { t } = useI18n();
  return (
    <p
      role="alert"
      className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        tone === "ok"
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
          : "border-red-400/20 bg-red-400/10 text-red-200"
      }`}
    >
      <span className="flex-1">{children}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.common.dismiss}
        className="cursor-pointer"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </p>
  );
}
