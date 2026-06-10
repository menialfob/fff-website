/**
 * Plain types and helpers shared between the Klub 100 server pages and
 * client components (no "use server"/"use client" — safe to import anywhere).
 */

export const TRACKLIST_SIZE = 100;

export type Placement = "EARLY" | "MIDDLE" | "LATE";

export const placementLabels: Record<Placement, string> = {
  EARLY: "Early",
  MIDDLE: "Middle",
  LATE: "Late",
};

/** Serializable view of a song row, built by the project page. */
export type SongView = {
  id: string;
  status: "SUGGESTED" | "ACCEPTED" | "REJECTED";
  position: number | null;
  spotifyTrackId: string;
  spotifyUrl: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  albumArtUrl: string | null;
  seg1StartMs: number;
  seg1EndMs: number;
  seg2StartMs: number | null;
  seg2EndMs: number | null;
  placement: Placement | null;
  placementNote: string | null;
  suggestedById: string;
  suggestedByName: string;
  hasCheers: boolean;
  cheersByName: string | null;
  voteCount: number;
  votedByMe: boolean;
};

/** 83000 → "1:23"; always m:ss, hours folded into minutes. */
export function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "1:23" / "83" → ms, or null when unparseable. */
export function parseTime(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(?:(\d+):)?(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  const minutes = match[1] ? parseInt(match[1], 10) : 0;
  const seconds = parseInt(match[2], 10);
  if (seconds >= 60 && match[1]) return null;
  return (minutes * 60 + seconds) * 1000;
}

export function segmentLabel(song: {
  seg1StartMs: number;
  seg1EndMs: number;
  seg2StartMs: number | null;
  seg2EndMs: number | null;
}): string {
  let label = `${formatMs(song.seg1StartMs)}–${formatMs(song.seg1EndMs)}`;
  if (song.seg2StartMs !== null && song.seg2EndMs !== null) {
    label += ` + ${formatMs(song.seg2StartMs)}–${formatMs(song.seg2EndMs)}`;
  }
  return label;
}
