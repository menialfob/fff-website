/**
 * Client-side sequencer for live Klub 100 playback (phase-2 PRD §2).
 *
 * Runs entirely in the host's browser: each song's cheers clip plays from
 * our own storage through `CheersPlayer` (downloaded during pre-flight and
 * decoded before it is due), then the song segment plays through the Spotify
 * Web Playback SDK (faded in/out via setVolume), and after each transition
 * progress is persisted server-side for crash-safe resume.
 *
 * The single "Start the mix" click is the one user gesture that unlocks
 * both audio paths (player.activateElement() + CheersPlayer.prime()) for the
 * whole ~2 h run.
 *
 * Timing is anchored to the wall clock, never counted in ticks: the SDK's
 * `getCurrentState()` is a round trip that can only be polled sparsely, so
 * the segment's position is extrapolated locally between polls and the fades
 * interpolate on elapsed milliseconds. Counting fixed steps instead — the
 * first version did — made every fade as long as its timers happened to take
 * and let the cut point drift past the end of the segment.
 *
 * Hardening principles for the live run (a room of 50+ people is watching):
 *  - Transient trouble (network blip, dropped play command, stale token,
 *    SDK reconnect) is retried quietly before anything is given up on.
 *  - A single bad *song* is skipped and listed; it must never take the rest
 *    of the mix with it.
 *  - Systemic trouble (device lost, Spotify unreachable, token refresh
 *    dead) fails fast with a resumable error screen instead of silently
 *    hanging or chain-skipping songs — progress is persisted, so a reload
 *    picks up from the same song.
 */

import {
  CheersPlayer,
  type CheersPlayback,
  type CheersProgress,
  type CheersTarget,
} from "./cheers-player";

export type PlaybackSegment = { startMs: number; endMs: number };

export type PlaybackSong = {
  id: string;
  position: number;
  spotifyTrackId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  suggestedByName: string;
  hasCheers: boolean;
  /** One or two segments — a 2×1-minute song earns two sips. */
  segments: PlaybackSegment[];
};

export type SkippedSong = { position: number; title: string; reason: string };

export type EnginePhase =
  | "idle" // before start()
  | "starting" // between the start gesture and first audio
  | "segment"
  | "cheers"
  | "finished"
  | "error"; // fatal — see state.error

export type EngineState = {
  phase: EnginePhase;
  songIndex: number;
  /** 0-based segment within the current song. */
  segmentIndex: number;
  segmentProgressMs: number;
  segmentDurationMs: number;
  paused: boolean;
  /** True while a cheers-less song's default clip plays. */
  usingDefaultCheers: boolean;
  /** Songs lost to Spotify unavailability — shown so the host knows. */
  skipped: SkippedSong[];
  error: string | null;
};

/** User-facing engine strings, provided by the caller from the i18n dict. */
export type EngineMessages = {
  sdkLoadFailed: string;
  closed: string;
  initFailed: string;
  authFailed: string;
  accountError: string;
  connectFailed: string;
  readyTimeout: string;
  tokenFailed: string;
  deviceLost: string;
  connectionLost: string;
  unexpected: string;
};

// --- Minimal typings for the Web Playback SDK (loaded from sdk.scdn.co) ----

type WebPlaybackState = {
  paused: boolean;
  position: number;
  track_window: { current_track: { uri: string } };
};

type SdkEventPayload = { device_id?: string; message?: string };

type SpotifyPlayer = {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (payload: SdkEventPayload) => void): boolean;
  getCurrentState(): Promise<WebPlaybackState | null>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  activateElement(): Promise<void>;
};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
  }
}

// --- Tuning -----------------------------------------------------------------

/**
 * Shortest gap between two volume writes in a fade, and the ceiling on how
 * many a single fade may make. `setVolume` is not free — the SDK mirrors it
 * onto the account's Connect state — and Spotify rate-limits volume control
 * hard enough to answer 403 "Cannot control device volume". Ten steps over a
 * second was already enough to sound smooth (PRD §11), so the ramp stays in
 * that neighbourhood however long the fade is; what changed is that the ramp
 * is positioned by the clock, not by counting the steps.
 */
const FADE_STEP_MS = 60;
const FADE_MAX_STEPS = 16;
/** How often the local segment clock is checked against the cut point. */
const CUT_TICK_MS = 25;
/** How often the SDK is asked for state (a round trip — kept sparse). */
const TICK_MS = 200;
/** How often the now-playing progress bar is refreshed. */
const PROGRESS_EMIT_MS = 100;
/** How long we give Spotify to actually start a track before re-sending. */
const START_TIMEOUT_MS = 10_000;
/** The play command itself is occasionally dropped — one full re-send round. */
const START_ROUNDS = 2;
const SDK_READY_TIMEOUT_MS = 15_000;
/** Consecutive null SDK states before we try to pull playback back. */
const NULL_STATE_LIMIT_MS = 4_000;
/**
 * How many times one segment may reclaim playback before the device counts as
 * gone for good. The SDK drops and reconnects on its own — most of all on
 * iOS — so one blip should not end the party; but each reclaim costs seconds
 * of silence, and standing in silence is its own way of ruining the evening,
 * so the patience stops well short of a hang.
 */
const RECLAIM_ATTEMPTS = 2;
/** No position movement while nominally playing → the stream is stuck. */
const STALL_LIMIT_MS = 15_000;
/** Sustained externally-paused readings before we mirror them into the UI. */
const EXTERNAL_PAUSE_LIMIT_MS = 1_500;
/** A wrong track that never becomes ours → the play command misfired. */
const WRONG_TRACK_LIMIT_MS = 3_000;
/** How often the cheers loop checks for the clip ending / a control press. */
const CHEERS_TICK_MS = 50;
/**
 * Longest the mix waits for a cheers clip pre-flight never finished
 * downloading. Past it the clip streams from the network like it used to.
 */
const CHEERS_WAIT_BUDGET_MS = 2_000;
/** Backoff schedule for token fetches and play commands (ms before try N). */
const TOKEN_RETRY_DELAYS_MS = [0, 800, 2_000];
const PLAY_RETRY_DELAYS_MS = [0, 600, 1_500];
/** How long requestPlay waits for an SDK mid-reconnect before commanding it. */
const DEVICE_READY_WAIT_MS = 10_000;
/** …and how long it waits once for a device Spotify has just 404'd on. */
const DEVICE_RECONNECT_WAIT_MS = 5_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Whether this browser lets script set playback volume at all.
 *
 * iOS keeps media volume on the hardware buttons: `HTMLMediaElement.volume`
 * is not settable there and always reads back 1 — Apple documents it, and
 * every iOS browser inherits it because they are all WebKit. The Spotify SDK
 * plays through a media element, so on an iPhone or iPad `setVolume()` is a
 * no-op and no fade is possible, on any account or network.
 *
 * Knowing that is better than pretending: a fade that cannot happen should
 * not still cost the last second of every segment, and the pre-flight should
 * say so rather than leave the host wondering why the sliders do nothing.
 */
export function volumeControlSupported(): boolean {
  try {
    const probe = document.createElement("audio");
    probe.volume = 0.5;
    return Math.abs(probe.volume - 0.5) < 0.01;
  } catch {
    return false;
  }
}

let sdkLoader: Promise<void> | null = null;

function loadSdkScript(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  if (!sdkLoader) {
    sdkLoader = new Promise<void>((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.onerror = () => {
        sdkLoader = null;
        reject(new Error("sdk-load-failed"));
      };
      document.body.appendChild(script);
    });
  }
  return sdkLoader;
}

// --- Engine -----------------------------------------------------------------

export type EngineCallbacks = {
  onState: (state: EngineState) => void;
  /** Fire-and-forget server persistence; failures must not stop the party. */
  persistProgress: (songId: string, segmentNo: number) => void;
  clearProgress: () => void;
  /** Pre-flight buffering of the cheers clips, for the checklist. */
  onCheersProgress?: (progress: CheersProgress) => void;
};

export class PlaybackEngine {
  private songs: PlaybackSong[];
  private cheersUrl: (songId: string) => string;
  private defaultCheersUrl: string;
  private fadeInMs: number;
  private fadeOutMs: number;
  private callbacks: EngineCallbacks;
  private messages: EngineMessages;

  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
  private deviceReady = false;
  private cheers = new CheersPlayer();
  private cheersPlayback: CheersPlayback | null = null;
  private apiToken: { value: string; expiresAt: number } | null = null;
  private apiTokenFetch: Promise<string> | null = null;

  /** Current SDK volume level (0–1, pre-curve) so fades start where they are. */
  private level = 1;
  private stopped = false;
  private skipRequested = false;
  private userPaused = false;
  private fatalError: string | null = null;
  /** Bumped by every fadeTo so a superseded fade stops writing volumes. */
  private fadeToken = 0;
  /** False on iOS, where volume is the hardware buttons' business alone. */
  private canFade = volumeControlSupported();

  private state: EngineState = {
    phase: "idle",
    songIndex: 0,
    segmentIndex: 0,
    segmentProgressMs: 0,
    segmentDurationMs: 0,
    paused: false,
    usingDefaultCheers: false,
    skipped: [],
    error: null,
  };

  constructor(options: {
    songs: PlaybackSong[];
    cheersUrl: (songId: string) => string;
    /** The project's own default clip, or the bundled one. */
    defaultCheersUrl: string;
    /** Curator-configured fades around every segment, in ms (0 = hard cut). */
    fadeInMs: number;
    fadeOutMs: number;
    callbacks: EngineCallbacks;
    messages: EngineMessages;
  }) {
    this.songs = options.songs;
    this.cheersUrl = options.cheersUrl;
    this.defaultCheersUrl = options.defaultCheersUrl;
    this.fadeInMs = Math.max(0, options.fadeInMs);
    this.fadeOutMs = Math.max(0, options.fadeOutMs);
    this.callbacks = options.callbacks;
    this.messages = options.messages;
  }

  private emit(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.callbacks.onState(this.state);
  }

  /**
   * Loads the SDK and creates our device. Needs no user gesture, so the
   * pre-flight panel calls it on mount and can show "device ready ✓"
   * before the host presses start.
   */
  async init(): Promise<{ ok: true } | { error: string }> {
    // Download every cheers clip while the host reads the checklist, so no
    // clip is ever streamed mid-party — a clip that stalls halfway through
    // is a cheers cut off halfway through. Best-effort: anything that does
    // not arrive streams from its URL at play time like before.
    void this.cheers.prefetch(this.cheersTargets(), (progress) =>
      this.callbacks.onCheersProgress?.(progress),
    );

    try {
      await loadSdkScript();
    } catch {
      return { error: this.messages.sdkLoadFailed };
    }
    if (this.stopped) return { error: this.messages.closed };

    const player = new window.Spotify!.Player({
      name: "FFF Klub 100",
      getOAuthToken: (cb) => {
        this.getApiToken()
          .then(cb)
          .catch(() => this.fail(this.messages.tokenFailed));
      },
      volume: 1,
    });
    this.player = player;

    const ready = new Promise<string>((resolve, reject) => {
      player.addListener("ready", (p) => {
        // Also fires again after an SDK reconnect mid-run.
        this.deviceReady = true;
        if (p.device_id) this.deviceId = p.device_id;
        resolve(p.device_id ?? "");
      });
      player.addListener("initialization_error", (p) =>
        reject(new Error(p.message ?? this.messages.initFailed)),
      );
      player.addListener("authentication_error", (p) => {
        // Mid-run the SDK re-asks getOAuthToken itself; make sure it gets a
        // fresh token rather than our cached one.
        this.apiToken = null;
        reject(new Error(p.message ?? this.messages.authFailed));
      });
      player.addListener("account_error", () =>
        reject(new Error(this.messages.accountError)),
      );
    });
    player.addListener("not_ready", () => {
      // Device dropped (network blip, Spotify Connect takeover). Don't kill
      // the run from here — reconnects usually follow. requestPlay waits for
      // the device to come back, and the segment watchdog reclaims or fails
      // with a resumable error if the audio actually died.
      this.deviceReady = false;
    });

    const connected = await player.connect();
    if (!connected) return { error: this.messages.connectFailed };

    try {
      this.deviceId = await Promise.race([
        ready,
        sleep(SDK_READY_TIMEOUT_MS).then(() => {
          throw new Error(this.messages.readyTimeout);
        }),
      ]);
    } catch (e) {
      return { error: e instanceof Error ? e.message : this.messages.initFailed };
    }
    this.deviceReady = true;
    return { ok: true };
  }

  /** The clip a song cheers with — its own, or the project's default. */
  private cheersTarget(song: PlaybackSong): CheersTarget {
    return song.hasCheers
      ? { key: song.id, url: this.cheersUrl(song.id) }
      : { key: "default", url: this.defaultCheersUrl };
  }

  /** Every distinct clip the mix will need, in the order it needs them. */
  private cheersTargets(): CheersTarget[] {
    const targets: CheersTarget[] = [
      { key: "default", url: this.defaultCheersUrl },
    ];
    for (const song of this.songs) {
      if (song.hasCheers) targets.push(this.cheersTarget(song));
    }
    return targets;
  }

  /** The one user gesture. Runs the whole mix from songs[fromIndex]. */
  async start(fromIndex: number) {
    if (!this.player || !this.deviceId) return;
    this.emit({ phase: "starting", songIndex: fromIndex });

    // Unlock both audio paths while we hold the gesture's activation. The
    // cheers prime must begin synchronously, before any await, or strict
    // autoplay policies (iOS above all) may treat later playback as
    // un-gestured and reject every cheers clip.
    this.cheers.prime();
    try {
      await this.player.activateElement();
    } catch {
      // Older SDK builds lack activateElement — connect()'s audio setup
      // combined with the click is usually enough; let playback try.
    }

    try {
      await this.run(fromIndex);
    } catch (e) {
      // The sequencer must never die silently mid-party: whatever slipped
      // through becomes a visible, resumable error instead of a frozen UI.
      console.error("Klub 100 playback crashed:", e);
      this.fail(this.messages.unexpected);
    }
  }

  private async run(fromIndex: number) {
    for (let i = fromIndex; i < this.songs.length; i++) {
      const song = this.songs[i];
      // A skip pressed during the previous song's final fade-out must not
      // carry over and eat this song too.
      this.skipRequested = false;
      for (let s = 0; s < song.segments.length; s++) {
        if (this.stopped || this.fatalError) return;
        this.callbacks.persistProgress(song.id, s + 1);
        this.emit({ songIndex: i, segmentIndex: s });

        // Cheers first — "skål!", sip, then the song drops. The clip after
        // this one is decoded while this one plays and the segment runs.
        const cheers = await this.playCheers(song, this.songs[i + 1]);
        if (this.stopped || this.fatalError) return;
        if (cheers === "skipped") break; // host pressed skip → next song

        const result = await this.playSegment(song, s);
        if (this.stopped || this.fatalError) return;
        if (result === "failed") {
          this.emit({
            skipped: [
              ...this.state.skipped,
              { position: song.position, title: `${song.title} — ${song.artist}`, reason: "unavailable on Spotify" },
            ],
          });
          break;
        }
        if (result === "skipped") break; // host pressed skip → next song
      }
    }

    if (!this.stopped && !this.fatalError) {
      this.callbacks.clearProgress();
      this.emit({ phase: "finished", paused: false });
    }
  }

  // --- Controls -------------------------------------------------------------

  pause() {
    if (this.userPaused || this.state.phase === "finished") return;
    this.userPaused = true;
    this.emit({ paused: true });
    if (this.state.phase === "segment") void this.player?.pause().catch(() => {});
    if (this.state.phase === "cheers") this.cheersPlayback?.pause();
  }

  resume() {
    if (!this.userPaused) return;
    this.userPaused = false;
    this.emit({ paused: false });
    if (this.state.phase === "segment") void this.player?.resume().catch(() => {});
    if (this.state.phase === "cheers") this.cheersPlayback?.resume();
  }

  /** Jump past the rest of the current song, segments and cheers included. */
  skip() {
    this.skipRequested = true;
    if (this.userPaused) this.resume(); // let the loops run so the skip lands
  }

  /** Tear-down on unmount / leaving the page. */
  stop() {
    this.stopped = true;
    this.cheersPlayback?.stop();
    this.cheersPlayback = null;
    this.cheers.destroy();
    void this.player?.pause().catch(() => {});
    this.player?.disconnect();
  }

  private fail(message: string) {
    if (this.fatalError) return;
    this.fatalError = message;
    this.emit({ phase: "error", error: message });
  }

  /**
   * Blocks while the host has playback paused (a pause pressed during a
   * fade-out lands between steps — the mix must hold, not start the next
   * cheers/segment underneath a "paused" UI).
   */
  private async holdWhilePaused(): Promise<"go" | "abort"> {
    while (this.userPaused) {
      if (this.stopped || this.fatalError) return "abort";
      if (this.skipRequested) return "go"; // caller's skip handling lands it
      await sleep(100);
    }
    return this.stopped || this.fatalError ? "abort" : "go";
  }

  // --- Spotify segment playback ---------------------------------------------

  /** Access token for direct Web API calls, refreshed well before expiry. */
  private getApiToken(): Promise<string> {
    if (this.apiToken && this.apiToken.expiresAt > Date.now() + 5 * 60_000) {
      return Promise.resolve(this.apiToken.value);
    }
    // Deduplicate: the SDK's getOAuthToken and our own play commands can ask
    // at the same moment; one fetch serves both.
    if (!this.apiTokenFetch) {
      this.apiTokenFetch = this.fetchApiToken().finally(() => {
        this.apiTokenFetch = null;
      });
    }
    return this.apiTokenFetch;
  }

  private async fetchApiToken(): Promise<string> {
    let lastError: unknown = null;
    for (const delay of TOKEN_RETRY_DELAYS_MS) {
      if (delay > 0) await sleep(delay);
      if (this.stopped) break;
      try {
        const res = await fetch("/api/spotify/token", { cache: "no-store" });
        if (!res.ok) throw new Error(`token fetch failed (${res.status})`);
        const data = (await res.json()) as { accessToken: string; expiresAt: string };
        this.apiToken = { value: data.accessToken, expiresAt: Date.parse(data.expiresAt) };
        return data.accessToken;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error("token fetch failed");
  }

  /**
   * Sends the play command for a track, retrying transient trouble.
   *  - "ok": Spotify accepted the command.
   *  - "refused": track-level rejection (region lock, removed) — skip the
   *    song, the rest of the mix is fine.
   *  - "fatal": systemic (device gone, Spotify unreachable, token dead) —
   *    fail() has been called; never chain-skip the whole tracklist on it.
   */
  private async requestPlay(
    trackUri: string,
    positionMs: number,
  ): Promise<"ok" | "refused" | "fatal"> {
    // If the SDK is mid-reconnect after a network blip, give it a moment
    // before aiming a play command at a device Spotify thinks is gone.
    const readyDeadline = Date.now() + DEVICE_READY_WAIT_MS;
    while (!this.deviceReady && Date.now() < readyDeadline) {
      if (this.stopped || this.fatalError) return "fatal";
      await sleep(200);
    }

    let sawTransientOnly = true;
    let waitedForDevice = false;
    for (let attempt = 0; attempt < PLAY_RETRY_DELAYS_MS.length; attempt++) {
      if (PLAY_RETRY_DELAYS_MS[attempt] > 0) await sleep(PLAY_RETRY_DELAYS_MS[attempt]);
      if (this.stopped || this.fatalError) return "fatal";

      let token: string;
      try {
        token = await this.getApiToken();
      } catch {
        this.fail(this.messages.tokenFailed);
        return "fatal";
      }
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: [trackUri], position_ms: positionMs }),
        },
      ).catch(() => null);

      if (!res) continue; // network blip — retry
      if (res.ok || res.status === 202) return "ok";
      if (res.status === 401) {
        this.apiToken = null; // token went stale early — force a refresh
        continue;
      }
      if (res.status === 404) {
        // "Device not found" — ours evaporated. Spotify will not know it
        // again until the SDK reconnects and announces itself, so wait for
        // that rather than firing the next attempt into the same void; if it
        // stays gone this is systemic, not the song's fault.
        if (attempt + 1 < PLAY_RETRY_DELAYS_MS.length) {
          if (!waitedForDevice) {
            waitedForDevice = true;
            this.deviceReady = false;
            const deadline = Date.now() + DEVICE_RECONNECT_WAIT_MS;
            while (!this.deviceReady && Date.now() < deadline) {
              if (this.stopped || this.fatalError) return "fatal";
              await sleep(200);
            }
          }
          continue;
        }
        this.fail(this.messages.deviceLost);
        return "fatal";
      }
      if (res.status === 429 || res.status >= 500) continue; // transient
      sawTransientOnly = false; // 400/403 — this track is refused
      break;
    }
    if (sawTransientOnly) {
      // Every attempt died on network/5xx: Spotify is unreachable. Skipping
      // this song would chain-skip everything behind it — stop resumably.
      this.fail(this.messages.connectionLost);
      return "fatal";
    }
    return "refused";
  }

  private async playSegment(
    song: PlaybackSong,
    segmentIndex: number,
  ): Promise<"completed" | "skipped" | "failed"> {
    const player = this.player!;
    const seg = song.segments[segmentIndex];
    const segLen = seg.endMs - seg.startMs;
    const trackUri = `spotify:track:${song.spotifyTrackId}`;
    // Segments shorter than the fade window get proportionally shorter
    // fades instead of being eaten by them (PRD §9 default: clamp here).
    // A configured 0 stays 0 — that is the curator asking for a hard cut —
    // and so does every fade where the platform refuses volume control,
    // because holding the last second of the segment back for a fade nobody
    // can hear only loses a second of the song.
    const clampFade = (ms: number) =>
      ms <= 0 || !this.canFade
        ? 0
        : Math.max(100, Math.min(ms, Math.floor(segLen / 3)));
    const fadeIn = clampFade(this.fadeInMs);
    const fadeOut = clampFade(this.fadeOutMs);
    /** Courtesy duck when the host skips — never longer than the fade-out. */
    const skipFade = Math.min(250, fadeOut);

    this.emit({
      phase: "segment",
      segmentProgressMs: 0,
      segmentDurationMs: segLen,
      usingDefaultCheers: false,
    });

    if ((await this.holdWhilePaused()) === "abort") return "failed";
    if (this.skipRequested) {
      this.skipRequested = false;
      return "skipped";
    }

    await this.fadeTo(0, 0);

    // Ask Spotify to start the track. The command is occasionally accepted
    // but never acted on, so one silent full re-send round before giving up.
    let startPosition: number | null = null;
    for (let round = 0; round < START_ROUNDS && startPosition === null; round++) {
      const requested = await this.requestPlay(trackUri, seg.startMs);
      if (requested === "fatal") return "failed";
      if (requested === "refused") return "failed";
      startPosition = await this.waitForTrackStart(trackUri);
      if (this.stopped || this.fatalError) return "failed";
      if (this.skipRequested) {
        this.skipRequested = false;
        await player.pause().catch(() => {});
        return "skipped";
      }
    }
    if (startPosition === null) return "failed";

    // The track is audible from here, so the fade-in starts here — and the
    // local clock is anchored on the same reading, so the cut point is
    // measured from the moment sound actually began.
    let anchorPosition = startPosition;
    let anchorAt = performance.now();
    let lastPollAt = anchorAt;
    void this.fadeTo(1, fadeIn);

    // Watch the position until the cut point (minus the fade-out window).
    // `progressed` gates the "ended early" fallback below: even after
    // waitForTrackStart saw the track playing, the SDK can briefly report
    // paused/position 0 while the freshly-requested track is still settling.
    // Honouring that transient as an early end skips the song right after the
    // cheers — the intermittent skip hosts were seeing. Only trust it once we
    // have actually observed the track making progress.
    let progressed = false;
    let reclaims = 0;
    let nullSince: number | null = null;
    let wrongTrackSince: number | null = null;
    let externallyPausedSince: number | null = null;
    let lastPosition = -1;
    let lastMovementAt = performance.now();
    let lastProgressEmitAt = 0;

    /** Where the track is right now, extrapolated from the last SDK reading. */
    const estimatedPosition = (now: number) =>
      anchorPosition < 0 ? null : anchorPosition + (now - anchorAt);

    while (true) {
      if (this.stopped) return "skipped";
      if (this.fatalError) return "failed";
      if (this.skipRequested) {
        this.skipRequested = false;
        await this.fadeTo(0, skipFade);
        await player.pause().catch(() => {});
        return "skipped";
      }
      if (this.userPaused) {
        nullSince = wrongTrackSince = externallyPausedSince = null;
        // Paused time is neither a stall nor progress: drop the local clock
        // and re-anchor from the first reading after the resume.
        anchorPosition = -1;
        lastPollAt = 0;
        lastMovementAt = performance.now();
        await sleep(TICK_MS);
        continue;
      }

      const now = performance.now();

      // The cut point is checked against the local clock on every tick.
      // Waiting for the next SDK poll instead would put the start of the
      // fade-out up to a poll interval late — enough of the fade to land
      // past the end of the segment, which is what made a configured fade
      // sound like a hard cut.
      const estimated = estimatedPosition(now);
      if (estimated !== null) {
        // The cut point is worth checking 40 times a second; the progress
        // bar is not — re-rendering the now-playing screen that often is
        // visible jank on a phone.
        if (now - lastProgressEmitAt >= PROGRESS_EMIT_MS) {
          lastProgressEmitAt = now;
          this.emit({
            segmentProgressMs: Math.max(
              0,
              Math.min(estimated - seg.startMs, segLen),
            ),
          });
        }
        if (estimated >= seg.endMs - fadeOut) break;
      }

      if (now - lastPollAt < TICK_MS) {
        // Wake often near the cut point and lazily away from it: the
        // fade-out has to start on time, but for the minute before it there
        // is nothing to do between SDK polls.
        const untilPoll = TICK_MS - (now - lastPollAt);
        const untilCut =
          estimated === null ? TICK_MS : seg.endMs - fadeOut - estimated;
        await sleep(Math.max(CUT_TICK_MS, Math.min(untilPoll, untilCut)));
        continue;
      }
      // Timestamp the reading before the round trip: the SDK's position is
      // as of some moment during the call, so treating it as current on
      // return would under-count elapsed time and cut late every poll.
      lastPollAt = now;
      const state = await player.getCurrentState().catch(() => null);

      if (!state) {
        // Our device is no longer the active one: Spotify Connect takeover
        // (someone's phone grabbed the account), a network drop, or the
        // session died. Try to pull playback back once; if it happens again
        // this segment, surface a resumable error instead of hanging in
        // silence forever.
        nullSince ??= now;
        if (performance.now() - nullSince > NULL_STATE_LIMIT_MS) {
          if (reclaims >= RECLAIM_ATTEMPTS) {
            this.fail(this.messages.deviceLost);
            return "failed";
          }
          reclaims++;
          nullSince = null;
          const resumeAt = seg.startMs + this.state.segmentProgressMs;
          const back = await this.requestPlay(trackUri, resumeAt);
          if (back !== "ok") return "failed"; // fatal already set on "fatal"
          anchorPosition = resumeAt;
          anchorAt = performance.now();
          await this.fadeTo(1, 0);
        }
        continue;
      }
      nullSince = null;

      if (state.track_window.current_track?.uri !== trackUri) {
        // A different track on our device. After real progress it means our
        // track ran out and Spotify's autoplay moved on — end the segment
        // and cut the imposter. Before any progress it means the play
        // command misfired; give it a moment to settle, then re-send.
        if (progressed) {
          await this.fadeTo(0, skipFade);
          await player.pause().catch(() => {});
          return "completed";
        }
        wrongTrackSince ??= now;
        if (performance.now() - wrongTrackSince > WRONG_TRACK_LIMIT_MS) {
          return "failed";
        }
        continue;
      }
      wrongTrackSince = null;

      if (state.paused) {
        // Track ended early (segment ran to the end of the song).
        if (progressed && state.position === 0) return "completed";
        // Paused from outside (Spotify app on the host's phone, another
        // device, an OS audio interruption): mirror it into the UI after a
        // sustained window so the host sees "paused" and can press resume,
        // instead of staring at a silently frozen progress bar.
        externallyPausedSince ??= now;
        if (
          performance.now() - externallyPausedSince > EXTERNAL_PAUSE_LIMIT_MS &&
          state.position > 0
        ) {
          externallyPausedSince = null;
          this.userPaused = true;
          this.emit({ paused: true });
        }
        // The local clock must not run on while the audio does not.
        anchorPosition = -1;
        continue;
      }
      externallyPausedSince = null;

      anchorPosition = state.position;
      anchorAt = now;
      if (state.position !== lastPosition) {
        lastPosition = state.position;
        lastMovementAt = now;
      } else if (now - lastMovementAt > STALL_LIMIT_MS) {
        // "Playing" but the clock is stuck — a wedged stream. Better to lose
        // this song than to stand in silence.
        await player.pause().catch(() => {});
        return "failed";
      }
      if (state.position > seg.startMs) progressed = true;
    }

    // The segment is over as far as the room is concerned; the fade-out is
    // its tail, not a part the bar should still be filling.
    this.emit({ segmentProgressMs: segLen });
    await this.fadeTo(0, fadeOut);
    await player.pause().catch(() => {});
    return "completed";
  }

  /**
   * Waits for our track to actually be playing, returning the position it
   * was at — the anchor the segment's local clock and its fade-in are both
   * measured from. Null when the track never started.
   */
  private async waitForTrackStart(trackUri: string): Promise<number | null> {
    const deadline = performance.now() + START_TIMEOUT_MS;
    while (performance.now() < deadline) {
      if (this.stopped || this.fatalError || this.skipRequested) return null;
      const state = await this.player!.getCurrentState().catch(() => null);
      if (
        state &&
        !state.paused &&
        state.track_window.current_track?.uri === trackUri
      ) {
        return state.position;
      }
      // Tighter than the segment poll: every millisecond spent here is a
      // millisecond of the fade-in the room hears as silence.
      await sleep(100);
    }
    return null;
  }

  /**
   * setVolume ramp with a squared curve (perceptually smoother than linear).
   * Each step's level comes from elapsed wall-clock time rather than from a
   * step counter, so a slow round trip or a late timer moves the ramp along
   * instead of stretching it: a fade-out started at the cut point ends at the
   * cut point, which is what a fade counted in steps could not promise.
   *
   * A zero-length fade is a straight jump — that is a curator asking for a
   * hard cut, and it is also what every fade becomes on a platform that
   * refuses volume control. Starting a fade supersedes any fade still in
   * flight, so a skip pressed mid-fade-in ducks out instead of fighting it.
   */
  private async fadeTo(target: number, durationMs: number) {
    const token = ++this.fadeToken;
    const from = this.level;
    if (durationMs <= 0 || from === target) {
      await this.setLevel(target);
      return;
    }
    const steps = Math.max(
      2,
      Math.min(FADE_MAX_STEPS, Math.round(durationMs / FADE_STEP_MS)),
    );
    const stepMs = durationMs / steps;
    const startedAt = performance.now();
    for (;;) {
      if (this.stopped || this.fadeToken !== token) return;
      const progress = Math.min(
        1,
        (performance.now() - startedAt) / durationMs,
      );
      await this.setLevel(from + (target - from) * progress);
      if (progress >= 1) return;
      await sleep(stepMs);
    }
  }

  private setLevel(level: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, level));
    this.level = clamped;
    // On a platform that pins playback volume to the hardware buttons the
    // call cannot do anything, and the SDK would still forward it to the
    // account's Connect state — so don't make it at all.
    if (!this.canFade) return Promise.resolve();
    return (
      this.player?.setVolume(clamped * clamped).catch(() => {}) ??
      Promise.resolve()
    );
  }

  // --- Cheers ---------------------------------------------------------------

  /**
   * Plays a song's cheers clip end to end. The clip is normally already
   * downloaded and decoded, so this is a scheduled buffer with a known
   * duration rather than a media element racing the network — the reason a
   * cheers no longer gets cut off halfway through.
   */
  private async playCheers(
    song: PlaybackSong,
    nextSong: PlaybackSong | undefined,
  ): Promise<"completed" | "skipped"> {
    if ((await this.holdWhilePaused()) === "abort") return "completed";
    if (this.skipRequested) {
      this.skipRequested = false;
      return "skipped";
    }

    this.emit({ phase: "cheers", usingDefaultCheers: !song.hasCheers });
    const playback = await this.cheers.play(
      this.cheersTarget(song),
      CHEERS_WAIT_BUDGET_MS,
    );
    this.cheersPlayback = playback;
    if (this.userPaused) playback.pause();
    // Decode the next clip now: this cheers plus the segment behind it is a
    // minute of slack, and decoding is the only work left before it plays.
    if (nextSong) void this.cheers.warm(this.cheersTarget(nextSong));

    const finish = (result: "completed" | "skipped") => {
      playback.stop();
      this.cheersPlayback = null;
      return result;
    };

    for (;;) {
      if (this.stopped) return finish("skipped");
      if (this.fatalError) return finish("completed"); // run() bails right after
      if (this.skipRequested) {
        this.skipRequested = false;
        return finish("skipped");
      }
      if (!this.userPaused && playback.isFinished()) return finish("completed");
      await sleep(CHEERS_TICK_MS);
    }
  }
}
