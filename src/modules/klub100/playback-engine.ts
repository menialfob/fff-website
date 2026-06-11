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

const FADE_MS = 1000;
const FADE_STEPS = 10;
/** Position poll interval while a segment plays (bounds cut-point overshoot). */
const TICK_MS = 200;
/** How long we give Spotify to actually start a track before skipping it. */
const START_TIMEOUT_MS = 10_000;
const SDK_READY_TIMEOUT_MS = 15_000;

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
        reject(new Error("Could not load the Spotify player — check the network."));
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
  private callbacks: EngineCallbacks;

  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
  private cheersAudio: HTMLAudioElement | null = null;
  private apiToken: { value: string; expiresAt: number } | null = null;

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
    defaultCheersUrl: string;
    callbacks: EngineCallbacks;
  }) {
    this.songs = options.songs;
    this.cheersUrl = options.cheersUrl;
    this.defaultCheersUrl = options.defaultCheersUrl;
    this.callbacks = options.callbacks;
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
    try {
      await loadSdkScript();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not load the Spotify player." };
    }
    if (this.stopped) return { error: "Playback was closed." };

    const player = new window.Spotify!.Player({
      name: "FFF Klub 100",
      getOAuthToken: (cb) => {
        this.getApiToken()
          .then(cb)
          .catch(() => this.fail("Could not refresh the Spotify token."));
      },
      volume: 1,
    });
    this.player = player;

    const ready = new Promise<string>((resolve, reject) => {
      player.addListener("ready", (p) => resolve(p.device_id ?? ""));
      player.addListener("initialization_error", (p) =>
        reject(new Error(p.message ?? "Spotify player failed to initialize.")),
      );
      player.addListener("authentication_error", (p) =>
        reject(new Error(p.message ?? "Spotify rejected the connection.")),
      );
      player.addListener("account_error", () =>
        reject(new Error("Spotify rejected the account — hosting requires Premium.")),
      );
    });
    player.addListener("not_ready", () => {
      // Device dropped mid-run (network blip, Spotify Connect takeover).
      if (this.state.phase === "segment") {
        this.fail("The Spotify player disconnected — resume to pick up from here.");
      }
    });

    const connected = await player.connect();
    if (!connected) return { error: "Could not connect the Spotify player." };

    try {
      this.deviceId = await Promise.race([
        ready,
        sleep(SDK_READY_TIMEOUT_MS).then(() => {
          throw new Error("Spotify player took too long to get ready.");
        }),
      ]);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Spotify player failed to start." };
    }
    return { ok: true };
  }

  /** The one user gesture. Runs the whole mix from songs[fromIndex]. */
  async start(fromIndex: number) {
    if (!this.player || !this.deviceId) return;
    this.emit({ phase: "starting", songIndex: fromIndex });

    // Unlock both audio paths while we hold the gesture's activation.
    try {
      await this.player.activateElement();
    } catch {
      // Older SDK builds lack activateElement — connect()'s audio setup
      // combined with the click is usually enough; let playback try.
    }
    const audio = new Audio();
    this.cheersAudio = audio;
    audio.src = this.defaultCheersUrl;
    audio.volume = 0;
    try {
      await audio.play();
      audio.pause();
    } catch {
      // Priming is best-effort; the real play() below will surface errors.
    }
    audio.volume = 1;

    await this.run(fromIndex);
  }

  private async run(fromIndex: number) {
    for (let i = fromIndex; i < this.songs.length; i++) {
      const song = this.songs[i];
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
    if (this.state.phase === "segment") void this.player?.pause();
    if (this.state.phase === "cheers") this.cheersAudio?.pause();
  }

  resume() {
    if (!this.userPaused) return;
    this.userPaused = false;
    this.emit({ paused: false });
    if (this.state.phase === "segment") void this.player?.resume();
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
  }

  private fail(message: string) {
    if (this.fatalError) return;
    this.fatalError = message;
    this.emit({ phase: "error", error: message });
  }

  // --- Spotify segment playback ---------------------------------------------

  /** Access token for direct Web API calls, refreshed well before expiry. */
  private async getApiToken(): Promise<string> {
    if (this.apiToken && this.apiToken.expiresAt > Date.now() + 5 * 60_000) {
      return this.apiToken.value;
    }
    const res = await fetch("/api/spotify/token");
    if (!res.ok) throw new Error("Could not get a Spotify token.");
    const data = (await res.json()) as { accessToken: string; expiresAt: string };
    this.apiToken = { value: data.accessToken, expiresAt: Date.parse(data.expiresAt) };
    return data.accessToken;
  }

  private async playSegment(
    song: PlaybackSong,
    segmentIndex: number,
  ): Promise<"completed" | "skipped" | "failed"> {
    const player = this.player!;
    const seg = song.segments[segmentIndex];
    const segLen = seg.endMs - seg.startMs;
    // Segments shorter than the fade window get proportionally shorter
    // fades instead of being eaten by them (PRD §9 default: clamp here).
    const fade = Math.max(100, Math.min(FADE_MS, Math.floor(segLen / 3)));

    this.emit({
      phase: "segment",
      segmentProgressMs: 0,
      segmentDurationMs: segLen,
      usingDefaultCheers: false,
    });

    await this.setLevel(0);
    let token: string;
    try {
      token = await this.getApiToken();
    } catch {
      this.fail("Lost the Spotify connection (token refresh failed).");
      return "failed";
    }
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [`spotify:track:${song.spotifyTrackId}`],
          position_ms: seg.startMs,
        }),
      },
    ).catch(() => null);
    if (!res || (!res.ok && res.status !== 202)) return "failed";

    if (!(await this.waitForTrackStart(song.spotifyTrackId))) return "failed";
    await this.fadeTo(1, fade);

    // Watch the position until the cut point (minus the fade-out window).
    while (true) {
      if (this.stopped) return "skipped";
      if (this.fatalError) return "failed";
      if (this.skipRequested) {
        this.skipRequested = false;
        await this.fadeTo(0, 250);
        await player.pause().catch(() => {});
        return "skipped";
      }
      if (this.userPaused) {
        await sleep(TICK_MS);
        continue;
      }
      const state = await player.getCurrentState();
      if (state) {
        this.emit({
          segmentProgressMs: Math.max(0, Math.min(state.position - seg.startMs, segLen)),
        });
        if (state.position >= seg.endMs - fade) break;
        // Track ended early (segment ran to the end of the song).
        if (state.paused && state.position === 0) return "completed";
      }
      await sleep(TICK_MS);
    }

    await this.fadeTo(0, fade);
    await player.pause().catch(() => {});
    return "completed";
  }

  private async waitForTrackStart(trackId: string): Promise<boolean> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.stopped || this.fatalError) return false;
      const state = await this.player!.getCurrentState();
      if (
        state &&
        !state.paused &&
        state.track_window.current_track?.uri === `spotify:track:${trackId}`
      ) {
        return true;
      }
      await sleep(100);
    }
    return false;
  }

  /**
   * Stepped setVolume fade with a squared curve (perceptually smoother than
   * linear). ~10 steps over 1 s — the spike's zipper-noise criterion.
   */
  private async fadeTo(target: number, durationMs: number) {
    const from = this.level;
    if (from === target) return;
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

    this.emit({ phase: "cheers", usingDefaultCheers: !song.hasCheers });
    audio.src = song.hasCheers ? this.cheersUrl(song.id) : this.defaultCheersUrl;

    let finished = false;
    audio.onended = () => (finished = true);
    audio.onerror = () => (finished = true); // a broken clip must not stall the mix
    try {
      await audio.play();
    } catch {
      return "completed";
    }

    while (!finished) {
      if (this.stopped) return "skipped";
      if (this.skipRequested) {
        this.skipRequested = false;
        audio.pause();
        return "skipped";
      }
      await sleep(100);
    }
    return "completed";
  }
}
