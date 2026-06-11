"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PlaybackEngine,
  type EngineState,
  type PlaybackSong,
} from "./playback-engine";
import { clearPlaybackProgress, savePlaybackProgress } from "./playback-actions";

export type PlayScreenProps = {
  projectId: string;
  projectName: string;
  /** Accepted songs in tracklist order. */
  songs: PlaybackSong[];
  spotify: { configured: boolean; connected: boolean; premium: boolean };
  /** Saved progress, already validated against the current tracklist. */
  resumeSongId: string | null;
  tracklistTarget: number;
};

/** iOS Safari can't host (SDK unreliability — phase-1 PRD §6.3). */
function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

export function PlayScreen(props: PlayScreenProps) {
  const { projectId, songs } = props;
  const [ios, setIos] = useState(false);
  const [device, setDevice] = useState<{ status: "pending" | "ready" | "failed"; message?: string }>({ status: "pending" });
  const [started, setStarted] = useState(false);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const hostable =
    props.spotify.configured && props.spotify.connected && props.spotify.premium;

  useEffect(() => {
    setIos(isIos());
  }, []);

  // Create the SDK device during pre-flight (no gesture needed) so the
  // checklist can show it before the host presses start.
  useEffect(() => {
    if (!hostable || songs.length === 0 || ios) return;
    const engine = new PlaybackEngine({
      songs,
      cheersUrl: (songId) => `/api/klub100/cheers/${songId}`,
      defaultCheersUrl: "/default-cheers.wav",
      callbacks: {
        onState: setEngineState,
        persistProgress: (songId, segmentNo) => {
          void savePlaybackProgress(projectId, songId, segmentNo).catch(() => {});
        },
        clearProgress: () => {
          void clearPlaybackProgress(projectId).catch(() => {});
        },
      },
    });
    engineRef.current = engine;
    void engine.init().then((result) => {
      setDevice(
        "error" in result ? { status: "failed", message: result.error } : { status: "ready" },
      );
    });
    return () => {
      engine.stop();
      engineRef.current = null;
    };
    // The song list and connection facts are fixed for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostable, ios, projectId]);

  // Keep the host screen awake through the party (re-grab when the tab
  // comes back to the foreground — the lock is released on tab switch).
  useEffect(() => {
    if (!started) return;
    const grab = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        ?.request("screen")
        .then((lock) => (wakeLockRef.current = lock))
        .catch(() => {});
    };
    grab();
    document.addEventListener("visibilitychange", grab);
    return () => {
      document.removeEventListener("visibilitychange", grab);
      void wakeLockRef.current?.release().catch(() => {});
    };
  }, [started]);

  const resumeIndex = props.resumeSongId
    ? songs.findIndex((s) => s.id === props.resumeSongId)
    : -1;

  const start = (fromIndex: number) => {
    if (fromIndex === 0 && resumeIndex > 0) {
      void clearPlaybackProgress(projectId).catch(() => {});
    }
    setStarted(true);
    void engineRef.current?.start(fromIndex);
  };

  if (!started || !engineState || engineState.phase === "idle") {
    return (
      <PreFlight
        {...props}
        ios={ios}
        device={device}
        resumeIndex={resumeIndex}
        onStart={start}
      />
    );
  }
  return (
    <NowPlaying
      state={engineState}
      songs={songs}
      engine={engineRef.current}
      projectId={projectId}
    />
  );
}

// --- Pre-flight -------------------------------------------------------------

function PreFlight({
  projectId,
  projectName,
  songs,
  spotify,
  tracklistTarget,
  ios,
  device,
  resumeIndex,
  onStart,
}: PlayScreenProps & {
  ios: boolean;
  device: { status: "pending" | "ready" | "failed"; message?: string };
  resumeIndex: number;
  onStart: (fromIndex: number) => void;
}) {
  const missingCheers = songs.filter((s) => !s.hasCheers);
  const playPath = `/klub100/${projectId}/play`;

  if (ios) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <h2 className="font-semibold">Hosting isn&apos;t supported on iPhone/iPad</h2>
        <p className="mt-1 text-sm">
          Spotify&apos;s web player is unreliable on iOS Safari. Host the party
          from a laptop (Chrome, Edge or Firefox) or an Android phone instead —
          this page will work there.
        </p>
      </div>
    );
  }

  const ready =
    songs.length > 0 && spotify.connected && spotify.premium && device.status === "ready";

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Pre-flight</h2>

      <Check
        ok={songs.length >= tracklistTarget}
        warn={songs.length > 0 && songs.length < tracklistTarget}
        label={
          songs.length >= tracklistTarget
            ? `Tracklist complete (${songs.length} songs)`
            : songs.length > 0
              ? `Tracklist has only ${songs.length}/${tracklistTarget} songs — you can still play the partial list`
              : "The tracklist is empty — accept some songs first"
        }
      />

      <Check
        ok={missingCheers.length === 0}
        warn={missingCheers.length > 0}
        label={
          missingCheers.length === 0
            ? "Every song has a cheers recording"
            : `${missingCheers.length} song${missingCheers.length === 1 ? "" : "s"} missing cheers — the default clip will play`
        }
      >
        {missingCheers.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-sm text-stone-600">
            {missingCheers.map((s) => (
              <li key={s.id}>
                #{s.position} {s.title} — {s.artist}
              </li>
            ))}
          </ul>
        )}
      </Check>

      <Check
        ok={spotify.connected && spotify.premium}
        label={
          !spotify.configured
            ? "Spotify isn't configured on the server (SPOTIFY_CLIENT_ID)"
            : !spotify.connected
              ? "Spotify account not connected"
              : spotify.premium
                ? "Spotify connected (Premium)"
                : "Spotify connected, but hosting requires Premium"
        }
      >
        {spotify.configured && !spotify.connected && (
          <a
            href={`/api/spotify/login?returnTo=${encodeURIComponent(playPath)}`}
            className="mt-1 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Connect Spotify
          </a>
        )}
      </Check>

      {spotify.connected && spotify.premium && songs.length > 0 && (
        <Check
          ok={device.status === "ready"}
          warn={device.status === "pending"}
          label={
            device.status === "ready"
              ? "Spotify player ready on this device"
              : device.status === "pending"
                ? "Setting up the Spotify player…"
                : `Spotify player failed: ${device.message}`
          }
        />
      )}

      <div className="pt-3">
        {resumeIndex >= 0 && ready ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onStart(resumeIndex)}
              className="w-full rounded-xl bg-stone-900 px-6 py-4 text-lg font-semibold text-white hover:bg-stone-700 sm:w-auto"
            >
              ▶ Resume from #{songs[resumeIndex].position}
            </button>
            <button
              type="button"
              onClick={() => onStart(0)}
              className="block text-sm text-stone-500 hover:underline"
            >
              …or start over from #1
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!ready}
            onClick={() => onStart(0)}
            className="w-full rounded-xl bg-stone-900 px-6 py-4 text-lg font-semibold text-white hover:bg-stone-700 disabled:opacity-40 sm:w-auto"
          >
            ▶ Start the mix
          </button>
        )}
        <p className="mt-2 text-sm text-stone-500">
          {projectName} · plug this device into the speakers, then keep this
          tab open and in the foreground for the whole run.
        </p>
      </div>
    </div>
  );
}

function Check({
  ok,
  warn = false,
  label,
  children,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <p className="text-sm">
        <span className={ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-red-600"}>
          {ok ? "✓" : warn ? "⚠" : "✗"}
        </span>{" "}
        {label}
      </p>
      {children}
    </div>
  );
}

// --- Now playing ------------------------------------------------------------

function NowPlaying({
  state,
  songs,
  engine,
  projectId,
}: {
  state: EngineState;
  songs: PlaybackSong[];
  engine: PlaybackEngine | null;
  projectId: string;
}) {
  const song = songs[state.songIndex];
  const progress =
    state.segmentDurationMs > 0
      ? Math.min(state.segmentProgressMs / state.segmentDurationMs, 1)
      : 0;

  // Big type on a dark screen — it sits across the room at the party.
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-stone-950 p-6 text-center text-white">
      {state.phase === "finished" ? (
        <>
          <p className="text-6xl">🍻</p>
          <h2 className="text-4xl font-bold">That was the mix!</h2>
          <p className="text-stone-400">
            {songs.length} songs down.{" "}
            {state.skipped.length > 0 && `${state.skipped.length} lost to Spotify.`}
          </p>
          <Link
            href={`/klub100/${projectId}`}
            className="rounded-xl bg-white px-6 py-3 font-semibold text-stone-900"
          >
            Back to the project
          </Link>
        </>
      ) : state.phase === "error" ? (
        <>
          <h2 className="text-3xl font-bold text-red-400">Playback stopped</h2>
          <p className="max-w-md text-stone-300">{state.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-white px-6 py-3 font-semibold text-stone-900"
          >
            Reload — you can resume from #{song?.position}
          </button>
        </>
      ) : (
        <>
          <p className="text-xl font-medium text-stone-400">
            #{song.position} / {songs.length}
            {song.segments.length > 1 && ` · segment ${state.segmentIndex + 1} of 2`}
          </p>

          {song.albumArtUrl && (
            <img
              src={song.albumArtUrl}
              alt=""
              className={`h-48 w-48 rounded-2xl object-cover shadow-2xl transition-opacity sm:h-64 sm:w-64 ${
                state.phase === "cheers" ? "opacity-40" : ""
              }`}
            />
          )}

          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold sm:text-5xl">{song.title}</h2>
            <p className="mt-2 text-xl text-stone-300 sm:text-2xl">{song.artist}</p>
            <p className="mt-1 text-stone-500">suggested by {song.suggestedByName}</p>
          </div>

          {state.phase === "cheers" ? (
            <div className="text-4xl font-bold text-amber-300 sm:text-6xl">
              🍻 CHEERS!
              {state.usingDefaultCheers && (
                <p className="mt-1 text-sm font-normal text-stone-500">
                  (no cheers recorded — default clip)
                </p>
              )}
            </div>
          ) : (
            <div className="h-3 w-full max-w-xl overflow-hidden rounded-full bg-stone-800">
              <div
                className="h-3 rounded-full bg-emerald-400 transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => (state.paused ? engine?.resume() : engine?.pause())}
              className="min-w-32 rounded-xl bg-white px-6 py-4 text-lg font-semibold text-stone-900"
            >
              {state.paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button
              type="button"
              onClick={() => engine?.skip()}
              className="rounded-xl border border-stone-600 px-6 py-4 text-lg font-semibold text-stone-300 hover:bg-stone-800"
            >
              ⏭ Skip song
            </button>
          </div>

          {state.skipped.length > 0 && (
            <p className="max-w-xl text-sm text-stone-500">
              Lost to Spotify (sips owed!):{" "}
              {state.skipped.map((s) => `#${s.position} ${s.title}`).join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
