/**
 * Client-side sequencer for live Klub 100 playback (phase-2 PRD §2).
 *
 * Runs entirely in the host's browser: each song's cheers clip plays from
 * our own storage through one HTMLAudioElement, then the song segment plays
 * through the Spotify Web Playback SDK (faded in/out via setVolume), and
 * after each transition progress is persisted server-side for crash-safe
 * resume.
 *
 * The single "Start the mix" click is the one user gesture that unlocks
 * both audio paths (player.activateElement() + a muted prime of the cheers
 * element) for the whole ~2 h run.
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

const FADE_STEPS = 10;
/** Position poll interval while a segment plays (bounds cut-point overshoot). */
const TICK_MS = 200;
/** How long we give Spotify to actually start a track before re-sending. */
const START_TIMEOUT_MS = 10_000;
/** The play command itself is occasionally dropped — one full re-send round. */
const START_ROUNDS = 2;
const SDK_READY_TIMEOUT_MS = 15_000;
/** Consecutive null SDK states before we treat the device as lost/taken over. */
const NULL_STATE_LIMIT_MS = 4_000;
/** No position movement while nominally playing → the stream is stuck. */
const STALL_LIMIT_MS = 15_000;
/** Sustained externally-paused readings before we mirror them into the UI. */
const EXTERNAL_PAUSE_LIMIT_MS = 1_500;
/** A wrong track that never becomes ours → the play command misfired. */
const WRONG_TRACK_LIMIT_MS = 3_000;
/** A cheers clip whose clock stops this long is treated as finished. */
const CHEERS_STALL_LIMIT_MS = 10_000;
/** Backoff schedule for token fetches and play commands (ms before try N). */
const TOKEN_RETRY_DELAYS_MS = [0, 800, 2_000];
const PLAY_RETRY_DELAYS_MS = [0, 600, 1_500];
/** How long requestPlay waits for an SDK mid-reconnect before commanding it. */
const DEVICE_READY_WAIT_MS = 10_000;
/** Parallel downloads while pre-caching cheers clips during pre-flight. */
const PREFETCH_CONCURRENCY = 4;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  private cheersAudio: HTMLAudioElement | null = null;
  private apiToken: { value: string; expiresAt: number } | null = null;
  private apiTokenFetch: Promise<string> | null = null;
  /** songId (or "default") → object URL of the pre-downloaded cheers clip. */
  private cheersCache = new Map<string, string>();

  /** Current SDK volume level (0–1, pre-curve) so fades start where they are. */
  private level = 1;
  private stopped = false;
  private skipRequested = false;
  private userPaused = false;
  private fatalError: string | null = null;

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
    // Pre-cache every cheers clip while the host reads the checklist, so
    // mid-party cheers never depend on the network. Best-effort: anything
    // not cached streams from the URL at play time like before.
    void this.prefetchCheers();

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

  private async prefetchCheers() {
    const targets = [
      { key: "default", url: this.defaultCheersUrl },
      ...this.songs
        .filter((s) => s.hasCheers)
        .map((s) => ({ key: s.id, url: this.cheersUrl(s.id) })),
    ];
    const worker = async () => {
      for (;;) {
        const target = targets.shift();
        if (!target || this.stopped) return;
        try {
          const res = await fetch(target.url);
          if (!res.ok) continue;
          const blob = await res.blob();
          if (this.stopped) return;
          this.cheersCache.set(target.key, URL.createObjectURL(blob));
        } catch {
          // Leave it to stream from the network at play time.
        }
      }
    };
    await Promise.all(
      Array.from({ length: PREFETCH_CONCURRENCY }, () => worker()),
    );
  }

  /** The one user gesture. Runs the whole mix from songs[fromIndex]. */
  async start(fromIndex: number) {
    if (!this.player || !this.deviceId) return;
    this.emit({ phase: "starting", songIndex: fromIndex });

    // Unlock both audio paths while we hold the gesture's activation. The
    // cheers element's muted prime must begin synchronously, before any
    // await, or strict autoplay policies (iOS above all) may treat later
    // play() calls as un-gestured and reject every cheers clip.
    const audio = new Audio();
    this.cheersAudio = audio;
    audio.src = this.cheersCache.get("default") ?? this.defaultCheersUrl;
    audio.volume = 0;
    const prime = audio.play().catch(() => {
      // Priming is best-effort; the real play() below will surface errors.
    });
    try {
      await this.player.activateElement();
    } catch {
      // Older SDK builds lack activateElement — connect()'s audio setup
      // combined with the click is usually enough; let playback try.
    }
    await prime;
    audio.pause();
    audio.volume = 1;

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

        // Cheers first — "skål!", sip, then the song drops.
        const cheers = await this.playCheers(song);
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
    if (this.state.phase === "cheers") this.cheersAudio?.pause();
  }

  resume() {
    if (!this.userPaused) return;
    this.userPaused = false;
    this.emit({ paused: false });
    if (this.state.phase === "segment") void this.player?.resume().catch(() => {});
    if (this.state.phase === "cheers") void this.cheersAudio?.play().catch(() => {});
  }

  /** Jump past the rest of the current song, segments and cheers included. */
  skip() {
    this.skipRequested = true;
    if (this.userPaused) this.resume(); // let the loops run so the skip lands
  }

  /** Tear-down on unmount / leaving the page. */
  stop() {
    this.stopped = true;
    this.cheersAudio?.pause();
    void this.player?.pause().catch(() => {});
    this.player?.disconnect();
    for (const url of this.cheersCache.values()) URL.revokeObjectURL(url);
    this.cheersCache.clear();
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
        // "Device not found" — ours evaporated. Retry in case the SDK is
        // mid-reconnect; if it stays gone this is systemic, not the song's
        // fault.
        if (attempt + 1 < PLAY_RETRY_DELAYS_MS.length) continue;
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
    // A configured 0 stays 0 — that is the curator asking for a hard cut.
    const clampFade = (ms: number) =>
      ms <= 0 ? 0 : Math.max(100, Math.min(ms, Math.floor(segLen / 3)));
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

    await this.setLevel(0);

    // Ask Spotify to start the track. The command is occasionally accepted
    // but never acted on, so one silent full re-send round before giving up.
    let started = false;
    for (let round = 0; round < START_ROUNDS && !started; round++) {
      const requested = await this.requestPlay(trackUri, seg.startMs);
      if (requested === "fatal") return "failed";
      if (requested === "refused") return "failed";
      started = await this.waitForTrackStart(trackUri);
      if (this.stopped || this.fatalError) return "failed";
      if (this.skipRequested) {
        this.skipRequested = false;
        await player.pause().catch(() => {});
        return "skipped";
      }
    }
    if (!started) return "failed";

    await this.fadeTo(1, fadeIn);

    // Watch the position until the cut point (minus the fade-out window).
    // `progressed` gates the "ended early" fallback below: even after
    // waitForTrackStart saw the track playing, the SDK can briefly report
    // paused/position 0 while the freshly-requested track is still settling.
    // Honouring that transient as an early end skips the song right after the
    // cheers — the intermittent skip hosts were seeing. Only trust it once we
    // have actually observed the track making progress.
    let progressed = false;
    let reclaimed = false;
    let nullSince: number | null = null;
    let wrongTrackSince: number | null = null;
    let externallyPausedSince: number | null = null;
    let lastPosition = -1;
    let lastMovementAt = Date.now();

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
        lastMovementAt = Date.now(); // paused time is not a stall
        await sleep(TICK_MS);
        continue;
      }

      const state = await player.getCurrentState().catch(() => null);
      const now = Date.now();

      if (!state) {
        // Our device is no longer the active one: Spotify Connect takeover
        // (someone's phone grabbed the account), a network drop, or the
        // session died. Try to pull playback back once; if it happens again
        // this segment, surface a resumable error instead of hanging in
        // silence forever.
        nullSince ??= now;
        if (now - nullSince > NULL_STATE_LIMIT_MS) {
          if (reclaimed) {
            this.fail(this.messages.deviceLost);
            return "failed";
          }
          reclaimed = true;
          nullSince = null;
          const back = await this.requestPlay(
            trackUri,
            seg.startMs + this.state.segmentProgressMs,
          );
          if (back !== "ok") return "failed"; // fatal already set on "fatal"
          await this.setLevel(1);
        }
        await sleep(TICK_MS);
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
        if (now - wrongTrackSince > WRONG_TRACK_LIMIT_MS) return "failed";
        await sleep(TICK_MS);
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
        if (now - externallyPausedSince > EXTERNAL_PAUSE_LIMIT_MS && state.position > 0) {
          externallyPausedSince = null;
          this.userPaused = true;
          this.emit({ paused: true });
        }
        await sleep(TICK_MS);
        continue;
      }
      externallyPausedSince = null;

      this.emit({
        segmentProgressMs: Math.max(0, Math.min(state.position - seg.startMs, segLen)),
      });
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
      if (state.position >= seg.endMs - fadeOut) break;
      await sleep(TICK_MS);
    }

    await this.fadeTo(0, fadeOut);
    await player.pause().catch(() => {});
    return "completed";
  }

  private async waitForTrackStart(trackUri: string): Promise<boolean> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.stopped || this.fatalError || this.skipRequested) return false;
      const state = await this.player!.getCurrentState().catch(() => null);
      if (
        state &&
        !state.paused &&
        state.track_window.current_track?.uri === trackUri
      ) {
        return true;
      }
      await sleep(100);
    }
    return false;
  }

  /**
   * Stepped setVolume fade with a squared curve (perceptually smoother than
   * linear). ~10 steps over the fade window — the spike's zipper-noise
   * criterion. A zero-length fade is a straight jump to the target level.
   */
  private async fadeTo(target: number, durationMs: number) {
    const from = this.level;
    if (from === target) return;
    if (durationMs <= 0) {
      await this.setLevel(target);
      return;
    }
    for (let step = 1; step <= FADE_STEPS; step++) {
      if (this.stopped) return;
      const l = from + ((target - from) * step) / FADE_STEPS;
      await this.setLevel(l);
      if (step < FADE_STEPS) await sleep(durationMs / FADE_STEPS);
    }
  }

  private async setLevel(level: number) {
    this.level = level;
    await this.player!.setVolume(level * level).catch(() => {});
  }

  // --- Cheers ---------------------------------------------------------------

  private async playCheers(song: PlaybackSong): Promise<"completed" | "skipped"> {
    const audio = this.cheersAudio;
    if (!audio) return "completed";

    if ((await this.holdWhilePaused()) === "abort") return "completed";
    if (this.skipRequested) {
      this.skipRequested = false;
      return "skipped";
    }

    this.emit({ phase: "cheers", usingDefaultCheers: !song.hasCheers });
    const cacheKey = song.hasCheers ? song.id : "default";
    audio.src =
      this.cheersCache.get(cacheKey) ??
      (song.hasCheers ? this.cheersUrl(song.id) : this.defaultCheersUrl);

    let finished = false;
    audio.onended = () => (finished = true);
    audio.onerror = () => (finished = true); // a broken clip must not stall the mix
    try {
      await audio.play();
    } catch {
      return "completed";
    }

    // Watchdog: a clip whose download wedges (playback clock stuck) must
    // not hang the party — treat it as finished and move on.
    let lastTime = -1;
    let lastMovementAt = Date.now();
    while (!finished) {
      if (this.stopped) return "skipped";
      if (this.fatalError) {
        audio.pause();
        return "completed"; // run() bails right after
      }
      if (this.skipRequested) {
        this.skipRequested = false;
        audio.pause();
        return "skipped";
      }
      if (this.userPaused) {
        lastMovementAt = Date.now();
      } else if (audio.currentTime !== lastTime) {
        lastTime = audio.currentTime;
        lastMovementAt = Date.now();
      } else if (Date.now() - lastMovementAt > CHEERS_STALL_LIMIT_MS) {
        audio.pause();
        return "completed";
      }
      await sleep(100);
    }
    return "completed";
  }
}
