/**
 * Buffered playback of the Klub 100 cheers clips.
 *
 * The clips are short and few, so the whole point of this module is that
 * nothing about playing one depends on the network or on a media element's
 * event soup. Every clip is downloaded during pre-flight, decoded into an
 * `AudioBuffer` shortly before it is needed and played through Web Audio,
 * where the clip's exact duration is known up front.
 *
 * That matters because the old path — one `HTMLAudioElement`, `src` set and
 * `play()` called at the moment the cheers was due — could truncate a clip in
 * three separate ways at a party:
 *  - a clip still streaming over the venue's wifi stalls mid-word, and the
 *    engine's stall watchdog (rightly) moves on;
 *  - a network hiccup fires `error` on the element, which the engine has to
 *    treat as "finished" or risk hanging the mix;
 *  - a `MediaRecorder` clip that was quiet enough to skip re-encoding keeps
 *    its WebM container, whose header carries no duration — browsers end such
 *    a stream early often enough to be noticed.
 * A decoded `AudioBuffer` has none of those failure modes: the bytes are
 * already here, the duration is a number, and playback is scheduled on the
 * audio thread where tab throttling cannot reach it.
 *
 * Everything degrades: a browser without `AudioContext`, a codec Web Audio
 * cannot decode, or a clip the pre-flight never managed to fetch all fall back
 * to the old media-element path rather than losing the cheers entirely.
 */

export type CheersTarget = { key: string; url: string };
export type CheersProgress = { loaded: number; total: number };

/** Decoded clips held at once — the current one plus a little look-ahead. */
const DECODE_CACHE_SIZE = 6;
/** Ramp at each end of a clip, so a cut waveform cannot click in the PA. */
const CLICK_GUARD_S = 0.015;
/** Grace after a clip's known end before we stop waiting for `onended`. */
const FINISH_SLACK_S = 0.35;
/** Fallback path only: a media element whose clock stops this long is done. */
const ELEMENT_STALL_LIMIT_MS = 10_000;
/** Parallel downloads during pre-flight. */
const PREFETCH_CONCURRENCY = 4;
/** How long prime() waits for a suspended context before giving up on it. */
const CONTEXT_RESUME_WAIT_MS = 500;
/**
 * One silent frame of 8 kHz PCM. Playing it inside the start gesture is what
 * unlocks the fallback element for the rest of the run — the element, not the
 * clip, is what a gesture unlocks, so this costs nothing and needs no network.
 */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One clip in flight. `isFinished()` is polled by the engine's cheers loop;
 * it also drives the fallback path's stall watchdog, which is why it is a
 * method and not a getter.
 */
export interface CheersPlayback {
  isFinished(): boolean;
  pause(): void;
  resume(): void;
  stop(): void;
}

export class CheersPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** key → downloaded bytes. Encoded, so 100 clips stay a sane footprint. */
  private clips = new Map<string, Blob>();
  /** key → decoded audio, bounded and evicted oldest-first. */
  private decoded = new Map<string, AudioBuffer>();
  /** Fallback path only — created lazily, revoked in destroy(). */
  private objectUrls = new Map<string, string>();
  private element: HTMLAudioElement | null = null;
  private warming = new Map<string, Promise<void>>();
  private stopped = false;

  constructor() {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    } catch {
      // No Web Audio — the media element fallback carries the whole party.
      this.ctx = null;
      this.master = null;
    }
  }

  /**
   * Downloads every clip. Called during pre-flight so the mix never waits on
   * the network once it is running; failures are left to the fallback ladder
   * in `play()`.
   */
  async prefetch(
    targets: CheersTarget[],
    onProgress: (progress: CheersProgress) => void,
  ): Promise<void> {
    const total = targets.length;
    if (total === 0) {
      onProgress({ loaded: 0, total: 0 });
      return;
    }
    const queue = [...targets];
    let loaded = 0;
    const worker = async () => {
      for (;;) {
        const target = queue.shift();
        if (!target || this.stopped) return;
        await this.fetchClip(target);
        loaded++;
        if (!this.stopped) onProgress({ loaded, total });
      }
    };
    await Promise.all(
      Array.from({ length: PREFETCH_CONCURRENCY }, () => worker()),
    );
  }

  /**
   * Unlocks both audio paths. Must run inside the start gesture, before any
   * `await`, or iOS treats every later clip as un-gestured and refuses it.
   */
  prime(): void {
    if (this.ctx) {
      void this.ctx.resume().catch(() => {});
      try {
        // A single silent frame: the canonical iOS unlock, and harmless
        // everywhere else.
        const source = this.ctx.createBufferSource();
        source.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        source.connect(this.master!);
        source.start();
      } catch {
        // Unlocking is best-effort; play() surfaces real trouble.
      }
    }
    // The fallback element needs its own gestured play() to be usable later.
    const audio = this.getElement();
    audio.src = SILENT_WAV;
    audio.volume = 0;
    void audio.play().catch(() => {});
    audio.volume = 1;
  }

  /** Downloads and decodes a clip ahead of time (idempotent, deduplicated). */
  warm(target: CheersTarget): Promise<void> {
    if (this.decoded.has(target.key)) return Promise.resolve();
    const existing = this.warming.get(target.key);
    if (existing) return existing;
    const job = (async () => {
      await this.fetchClip(target);
      await this.decode(target.key);
    })().finally(() => this.warming.delete(target.key));
    this.warming.set(target.key, job);
    return job;
  }

  /**
   * Starts a clip, waiting at most `budgetMs` for it to be buffered and
   * decoded. Degrades in order: decoded buffer → downloaded bytes through the
   * media element → straight off the network.
   */
  async play(target: CheersTarget, budgetMs: number): Promise<CheersPlayback> {
    if (!this.decoded.has(target.key)) {
      await Promise.race([this.warm(target), sleep(budgetMs)]);
    }
    const buffer = this.decoded.get(target.key);
    if (buffer && (await this.contextRunning())) {
      const playback = this.playBuffer(buffer);
      if (playback) return playback;
    }
    return this.playElement(target);
  }

  /**
   * True when the context can actually play right now. A suspended context
   * accepts a scheduled buffer and simply never plays it, so a clip must
   * never be handed to one — that is a mix standing in silence, waiting for
   * a cheers that will not come.
   */
  private async contextRunning(): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx || !this.master) return false;
    // Read through a call so the state is re-checked after the await rather
    // than narrowed away. Safari has an "interrupted" state of its own.
    const running = () => ctx.state === "running";
    if (running()) return true;
    try {
      await Promise.race([ctx.resume(), sleep(CONTEXT_RESUME_WAIT_MS)]);
    } catch {
      return false;
    }
    return running();
  }

  /** Tear-down: stops the clock, frees the object URLs, closes the context. */
  destroy(): void {
    this.stopped = true;
    this.element?.pause();
    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.decoded.clear();
    this.clips.clear();
    void this.ctx?.close().catch(() => {});
  }

  // --- Fetch + decode -------------------------------------------------------

  private async fetchClip(target: CheersTarget): Promise<void> {
    if (this.clips.has(target.key) || this.stopped) return;
    try {
      const res = await fetch(target.url);
      if (!res.ok) return;
      const blob = await res.blob();
      if (!this.stopped) this.clips.set(target.key, blob);
    } catch {
      // Left for the fallback ladder in play().
    }
  }

  private async decode(key: string): Promise<void> {
    if (this.decoded.has(key) || this.stopped) return;
    const blob = this.clips.get(key);
    const ctx = this.ctx;
    if (!blob || !ctx) return;
    try {
      // decodeAudioData takes ownership of the buffer it is given, so the
      // Blob (not the ArrayBuffer) stays the thing we keep around.
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      if (this.stopped) return;
      this.decoded.set(key, buffer);
      for (const oldest of this.decoded.keys()) {
        if (this.decoded.size <= DECODE_CACHE_SIZE) break;
        if (oldest === key) continue;
        this.decoded.delete(oldest);
      }
    } catch {
      // A codec Web Audio cannot handle — the element may still manage it.
    }
  }

  // --- The two playback paths -----------------------------------------------

  private playBuffer(buffer: AudioBuffer): CheersPlayback | null {
    const ctx = this.ctx!;
    const master = this.master!;
    let source: AudioBufferSourceNode;
    let gain: GainNode;
    try {
      source = ctx.createBufferSource();
      source.buffer = buffer;
      gain = ctx.createGain();
      source.connect(gain);
      gain.connect(master);
    } catch {
      return null;
    }

    const startedAt = ctx.currentTime;
    const duration = buffer.duration;
    const guard = Math.min(CLICK_GUARD_S, duration / 4);
    gain.gain.setValueAtTime(0, startedAt);
    gain.gain.linearRampToValueAtTime(1, startedAt + guard);
    gain.gain.setValueAtTime(1, startedAt + duration - guard);
    gain.gain.linearRampToValueAtTime(0, startedAt + duration);

    let ended = false;
    source.onended = () => (ended = true);
    try {
      source.start();
    } catch {
      return null;
    }
    // `ctx.currentTime` stops while the context is suspended, so this
    // deadline stays honest across a pause and cannot be moved by tab
    // throttling — it only ever catches an `onended` that never arrives.
    const endsAt = startedAt + duration + FINISH_SLACK_S;
    // …and this one catches the context itself stopping (iOS pulling the
    // audio session out from under the tab), where the audio clock would
    // otherwise freeze and the mix would wait on it forever.
    let paused = false;
    let pausedSince = 0;
    let pausedTotalMs = 0;
    const wallDeadline =
      performance.now() + (duration + FINISH_SLACK_S) * 1000 + 1_000;

    return {
      isFinished: () => {
        if (ended) return true;
        if (paused) return false;
        return (
          ctx.currentTime > endsAt ||
          performance.now() - pausedTotalMs > wallDeadline
        );
      },
      // Suspending the context freezes the clip mid-word and its clock with
      // it, which is exactly what pausing the party should do.
      pause: () => {
        if (paused) return;
        paused = true;
        pausedSince = performance.now();
        void ctx.suspend().catch(() => {});
      },
      resume: () => {
        if (!paused) return;
        paused = false;
        pausedTotalMs += performance.now() - pausedSince;
        void ctx.resume().catch(() => {});
      },
      stop: () => {
        try {
          source.onended = null;
          source.stop();
        } catch {
          // Already ended.
        }
        gain.disconnect();
      },
    };
  }

  private playElement(target: CheersTarget): CheersPlayback {
    const audio = this.getElement();
    const blob = this.clips.get(target.key);
    let src = this.objectUrls.get(target.key);
    if (!src && blob) {
      src = URL.createObjectURL(blob);
      this.objectUrls.set(target.key, src);
    }
    // Detached before the source changes: an abort event left over from the
    // previous clip's load must not land on this clip's handlers and end it
    // before it has said a word.
    audio.onended = null;
    audio.onerror = null;
    audio.src = src ?? target.url;

    let ended = false;
    audio.onended = () => (ended = true);
    audio.onerror = () => (ended = true); // a broken clip must not stall the mix
    let lastTime = -1;
    let lastMovementAt = Date.now();
    let paused = false;
    void audio.play().catch(() => (ended = true));

    return {
      isFinished: () => {
        if (ended) return true;
        if (paused) {
          lastMovementAt = Date.now();
        } else if (audio.currentTime !== lastTime) {
          lastTime = audio.currentTime;
          lastMovementAt = Date.now();
        } else if (Date.now() - lastMovementAt > ELEMENT_STALL_LIMIT_MS) {
          audio.pause();
          return true;
        }
        return false;
      },
      pause: () => {
        paused = true;
        audio.pause();
      },
      resume: () => {
        paused = false;
        void audio.play().catch(() => (ended = true));
      },
      stop: () => {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      },
    };
  }

  private getElement(): HTMLAudioElement {
    if (!this.element) {
      this.element = new Audio();
      this.element.preload = "auto";
    }
    return this.element;
  }
}
