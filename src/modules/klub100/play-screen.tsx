"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { btnSpotify, card } from "@/components/ui";
import {
  AlertTriangleIcon,
  CheckIcon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  XIcon,
} from "@/components/icons";
import {
  PlaybackEngine,
  type EngineState,
  type PlaybackSong,
} from "./playback-engine";
import {
  clearPlaybackProgress,
  savePlaybackProgress,
} from "./playback-actions";

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

/**
 * The Spotify SDK has a history of unreliability on iOS (and every iOS
 * browser, Chrome included, runs Safari's WebKit engine underneath) — worth
 * a warning, but the host is free to try.
 */
function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

export function PlayScreen(props: PlayScreenProps) {
  const { projectId, songs } = props;
  const [ios, setIos] = useState(false);
  const [device, setDevice] = useState<{
    status: "pending" | "ready" | "failed";
    message?: string;
  }>({ status: "pending" });
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
    if (!hostable || songs.length === 0) return;
    const engine = new PlaybackEngine({
      songs,
      cheersUrl: (songId) => `/api/klub100/cheers/${songId}`,
      defaultCheersUrl: "/default-cheers.wav",
      callbacks: {
        onState: setEngineState,
        persistProgress: (songId, segmentNo) => {
          void savePlaybackProgress(projectId, songId, segmentNo).catch(
            () => {},
          );
        },
        clearProgress: () => {
          void clearPlaybackProgress(projectId).catch(() => {});
        },
      },
    });
    engineRef.current = engine;
    void engine.init().then((result) => {
      setDevice(
        "error" in result
          ? { status: "failed", message: result.error }
          : { status: "ready" },
      );
    });
    return () => {
      engine.stop();
      engineRef.current = null;
    };
    // The song list and connection facts are fixed for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostable, projectId]);

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
  const { t, fmt } = useI18n();
  const missingCheers = songs.filter((s) => !s.hasCheers);
  const playPath = `/klub100/${projectId}/play`;

  const ready =
    songs.length > 0 &&
    spotify.connected &&
    spotify.premium &&
    device.status === "ready";

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-white">
        {t.klub100.preflight}
      </h2>

      {ios && <Check ok={false} warn label={t.klub100.iosWarning} />}

      <Check
        ok={songs.length >= tracklistTarget}
        warn={songs.length > 0 && songs.length < tracklistTarget}
        label={
          songs.length >= tracklistTarget
            ? fmt(t.klub100.tracklistComplete, { count: songs.length })
            : songs.length > 0
              ? fmt(t.klub100.tracklistPartial, {
                  count: songs.length,
                  total: tracklistTarget,
                })
              : t.klub100.tracklistEmpty
        }
      />

      <Check
        ok={missingCheers.length === 0}
        warn={missingCheers.length > 0}
        label={
          missingCheers.length === 0
            ? t.klub100.allSongsHaveCheers
            : missingCheers.length === 1
              ? t.klub100.missingCheersOne
              : fmt(t.klub100.missingCheersMany, {
                  count: missingCheers.length,
                })
        }
      >
        {missingCheers.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-sm text-zinc-400">
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
            ? t.klub100.spotifyNotConfigured
            : !spotify.connected
              ? t.klub100.spotifyNotConnectedCheck
              : spotify.premium
                ? t.klub100.spotifyPremiumOk
                : t.klub100.spotifyNeedsPremium
        }
      >
        {spotify.configured && !spotify.connected && (
          <a
            href={`/api/spotify/login?returnTo=${encodeURIComponent(playPath)}`}
            className={`${btnSpotify} mt-2`}
          >
            {t.klub100.connect}
          </a>
        )}
      </Check>

      {spotify.connected && spotify.premium && songs.length > 0 && (
        <Check
          ok={device.status === "ready"}
          warn={device.status === "pending"}
          label={
            device.status === "ready"
              ? t.klub100.playerReady
              : device.status === "pending"
                ? t.klub100.playerPending
                : fmt(t.klub100.playerFailed, { message: device.message ?? "" })
          }
        />
      )}

      <div className="pt-3">
        {resumeIndex >= 0 && ready ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onStart(resumeIndex)}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-4 text-lg font-bold text-zinc-950 shadow-xl shadow-orange-500/25 transition hover:brightness-110 active:scale-[0.98] sm:w-auto"
            >
              <PlayIcon className="h-5 w-5" />
              {fmt(t.klub100.resumeFrom, {
                position: songs[resumeIndex].position,
              })}
            </button>
            <button
              type="button"
              onClick={() => onStart(0)}
              className="block cursor-pointer text-sm text-zinc-500 hover:text-zinc-300 hover:underline"
            >
              {t.klub100.startOver}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!ready}
            onClick={() => onStart(0)}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-4 text-lg font-bold text-zinc-950 shadow-xl shadow-orange-500/25 transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 sm:w-auto"
          >
            <PlayIcon className="h-5 w-5" />
            {t.klub100.startMix}
          </button>
        )}
        <p className="mt-2 text-sm text-zinc-500">
          {fmt(t.klub100.keepOpenHint, { name: projectName })}
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
    <div className={`${card} p-3`}>
      <p className="flex items-start gap-2 text-sm text-zinc-200">
        <span
          className={`mt-0.5 shrink-0 ${
            ok ? "text-emerald-400" : warn ? "text-amber-400" : "text-red-400"
          }`}
        >
          {ok ? (
            <CheckIcon className="h-4 w-4" />
          ) : warn ? (
            <AlertTriangleIcon className="h-4 w-4" />
          ) : (
            <XIcon className="h-4 w-4" />
          )}
        </span>
        <span>{label}</span>
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
  const { t, fmt } = useI18n();
  const router = useRouter();
  const song = songs[state.songIndex];
  const progress =
    state.segmentDurationMs > 0
      ? Math.min(state.segmentProgressMs / state.segmentDurationMs, 1)
      : 0;

  // Big type on a dark screen — it sits across the room at the party.
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-hidden bg-canvas p-6 text-center text-white">
      {/* Party glow behind the album art */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-600/15 blur-3xl" />
        <div className="absolute bottom-[-10%] left-1/4 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
      </div>
      <button
        type="button"
        aria-label={t.klub100.exit}
        onClick={() => {
          if (
            state.phase === "finished" ||
            state.phase === "error" ||
            confirm(fmt(t.klub100.confirmStop, { position: song?.position }))
          ) {
            // Unmounting stops the engine; progress is already persisted.
            router.push(`/klub100/${projectId}`);
          }
        }}
        className="absolute right-4 top-4 z-10 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/10"
      >
        <XIcon className="h-4 w-4" />
        {t.klub100.exit}
      </button>
      {state.phase === "finished" ? (
        <>
          <p className="relative text-6xl">🍻</p>
          <h2 className="relative text-4xl font-bold">
            {t.klub100.finishedTitle}
          </h2>
          <p className="relative text-zinc-400">
            {fmt(t.klub100.finishedSongs, { count: songs.length })}{" "}
            {state.skipped.length > 0 &&
              fmt(t.klub100.lostCount, { count: state.skipped.length })}
          </p>
          <Link
            href={`/klub100/${projectId}`}
            className="relative rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 font-bold text-zinc-950 shadow-xl shadow-orange-500/25"
          >
            {t.klub100.backToProject}
          </Link>
        </>
      ) : state.phase === "error" ? (
        <>
          <h2 className="relative text-3xl font-bold text-red-400">
            {t.klub100.playbackStopped}
          </h2>
          <p className="relative max-w-md text-zinc-300">{state.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="relative cursor-pointer rounded-2xl bg-white px-6 py-3 font-semibold text-zinc-950"
          >
            {fmt(t.klub100.reloadResume, { position: song?.position ?? 1 })}
          </button>
        </>
      ) : (
        <>
          <p className="relative text-xl font-medium text-zinc-400">
            #{song.position} / {songs.length}
            {song.segments.length > 1 &&
              ` ${fmt(t.klub100.segmentOf, { n: state.segmentIndex + 1 })}`}
          </p>

          {song.albumArtUrl && (
            <img
              src={song.albumArtUrl}
              alt=""
              className={`relative h-48 w-48 rounded-2xl object-cover shadow-2xl shadow-fuchsia-500/20 transition-opacity sm:h-64 sm:w-64 ${
                state.phase === "cheers" ? "opacity-40" : ""
              }`}
            />
          )}

          <div className="relative max-w-2xl">
            <h2 className="text-3xl font-bold sm:text-5xl">{song.title}</h2>
            <p className="mt-2 text-xl text-zinc-300 sm:text-2xl">
              {song.artist}
            </p>
            <p className="mt-1 text-zinc-500">
              {fmt(t.klub100.suggestedByLine, { name: song.suggestedByName })}
            </p>
          </div>

          {state.phase === "cheers" ? (
            <div className="relative bg-gradient-to-r from-amber-300 via-orange-400 to-amber-300 bg-clip-text text-4xl font-extrabold text-transparent sm:text-6xl">
              🍻 {t.klub100.cheersShout}
              {state.usingDefaultCheers && (
                <p className="mt-1 text-sm font-normal text-zinc-500">
                  {t.klub100.defaultCheersNote}
                </p>
              )}
            </div>
          ) : (
            <div className="relative h-3 w-full max-w-xl overflow-hidden rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-fuchsia-500 transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}

          <div className="relative flex items-center gap-4">
            <button
              type="button"
              onClick={() => (state.paused ? engine?.resume() : engine?.pause())}
              className="inline-flex min-w-32 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-lg font-bold text-zinc-950 transition active:scale-[0.98]"
            >
              {state.paused ? (
                <>
                  <PlayIcon className="h-5 w-5" />
                  {t.klub100.resume}
                </>
              ) : (
                <>
                  <PauseIcon className="h-5 w-5" />
                  {t.klub100.pause}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => engine?.skip()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/20 px-6 py-4 text-lg font-semibold text-zinc-300 transition hover:bg-white/10 active:scale-[0.98]"
            >
              <SkipForwardIcon className="h-5 w-5" />
              {t.klub100.skip}
            </button>
          </div>

          {state.skipped.length > 0 && (
            <p className="relative max-w-xl text-sm text-zinc-500">
              {t.klub100.lostToSpotify}{" "}
              {state.skipped
                .map((s) => `#${s.position} ${s.title}`)
                .join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
