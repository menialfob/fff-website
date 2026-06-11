/**
 * Best-effort trimming of the dead air around a fresh cheers recording —
 * people press record, hesitate, and only then shout "skål!".
 *
 * Deliberately conservative so it never clips into the voice: loudness is
 * measured as RMS over 20 ms windows, the threshold adapts to the clip's own
 * peak, and a generous pre/post-roll is kept around the detected speech.
 * Anything unexpected (decode failure, all-quiet clip, nothing worth
 * trimming) returns the original file untouched.
 *
 * The result is re-encoded as 16-bit PCM WAV: at most 10 s of mic audio,
 * well under the 5 MB cheers upload cap.
 */

const WINDOW_MS = 20;
/** Never treat anything below this RMS as speech (absolute floor). */
const MIN_THRESHOLD = 0.01;
/** …otherwise speech starts where a window reaches this share of the peak. */
const PEAK_FRACTION = 0.08;
/** Kept before the first / after the last loud window. */
const PRE_ROLL_MS = 200;
const POST_ROLL_MS = 300;
/** Re-encoding is only worth it if we actually cut a noticeable chunk. */
const MIN_SAVING_MS = 300;

export async function trimSilence(file: File): Promise<File> {
  try {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return file;
    const ctx = new Ctx();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } finally {
      void ctx.close().catch(() => {});
    }

    const windowSamples = Math.max(1, Math.round((buffer.sampleRate * WINDOW_MS) / 1000));
    const rms = windowRms(buffer, windowSamples);
    const peak = Math.max(...rms);
    const threshold = Math.max(MIN_THRESHOLD, peak * PEAK_FRACTION);

    const firstLoud = rms.findIndex((v) => v >= threshold);
    if (firstLoud === -1) return file; // nothing but silence — leave it alone
    let lastLoud = rms.length - 1;
    while (lastLoud > firstLoud && rms[lastLoud] < threshold) lastLoud--;

    const msToSamples = (ms: number) => Math.round((buffer.sampleRate * ms) / 1000);
    const start = Math.max(0, firstLoud * windowSamples - msToSamples(PRE_ROLL_MS));
    const end = Math.min(
      buffer.length,
      (lastLoud + 1) * windowSamples + msToSamples(POST_ROLL_MS),
    );
    if (buffer.length - (end - start) < msToSamples(MIN_SAVING_MS)) return file;

    const wav = encodeWav(buffer, start, end);
    return new File([wav], "cheers.wav", { type: "audio/wav" });
  } catch {
    return file;
  }
}

/** RMS per fixed-size window, computed over all channels mixed together. */
function windowRms(buffer: AudioBuffer, windowSamples: number): number[] {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const result: number[] = [];
  for (let start = 0; start < buffer.length; start += windowSamples) {
    const end = Math.min(start + windowSamples, buffer.length);
    let sum = 0;
    for (const data of channels) {
      for (let i = start; i < end; i++) sum += data[i] * data[i];
    }
    result.push(Math.sqrt(sum / ((end - start) * channels.length)));
  }
  return result;
}

/** Standard 16-bit PCM WAV of buffer[start..end), preserving channel count. */
function encodeWav(buffer: AudioBuffer, start: number, end: number): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const frames = end - start;
  const dataSize = frames * channels * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = start; i < end; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}

declare global {
  interface Window {
    /** Safari < 14.1 prefix — kept for old iPhones in the friend group. */
    webkitAudioContext?: typeof AudioContext;
  }
}
