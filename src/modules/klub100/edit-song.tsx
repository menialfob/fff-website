"use client";

import { useState, useTransition } from "react";
import { attachCheers, editSong, removeCheers } from "./actions";
import { CheersCapture } from "./cheers-recorder";
import { SegmentPicker, type Segment } from "./segment-picker";
import { placementLabels, type Placement, type SongView } from "./shared";

/**
 * Pencil button + dialog to edit an existing suggestion's timing, placement and
 * cheers. Rendered only for the suggestor or a project curator.
 */
export function EditSongButton({ song }: { song: SongView }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs hover:bg-stone-100"
      >
        ✎ Edit
      </button>
      {open && <EditSongDialog song={song} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditSongDialog({
  song,
  onClose,
}: {
  song: SongView;
  onClose: () => void;
}) {
  const [seg1, setSeg1] = useState<Segment>({
    startMs: song.seg1StartMs,
    endMs: song.seg1EndMs,
  });
  const [seg2, setSeg2] = useState<Segment | null>(
    song.seg2StartMs !== null && song.seg2EndMs !== null
      ? { startMs: song.seg2StartMs, endMs: song.seg2EndMs }
      : null,
  );
  const [placement, setPlacement] = useState<Placement | null>(song.placement);
  const [note, setNote] = useState(song.placementNote ?? "");
  const [cheersFile, setCheersFile] = useState<File | null>(null);
  const [hasCheers, setHasCheers] = useState(song.hasCheers);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const dropCheers = () => {
    startTransition(async () => {
      const result = await removeCheers(song.id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setHasCheers(false);
    });
  };

  const save = () => {
    startTransition(async () => {
      const result = await editSong({
        songId: song.id,
        seg1StartMs: seg1.startMs,
        seg1EndMs: seg1.endMs,
        seg2StartMs: seg2?.startMs ?? null,
        seg2EndMs: seg2?.endMs ?? null,
        placement,
        placementNote: note || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (cheersFile) {
        const formData = new FormData();
        formData.set("songId", song.id);
        formData.set("file", cheersFile);
        const cheersResult = await attachCheers(formData);
        if (cheersResult?.error) {
          setError(`Timing saved, but the cheers failed: ${cheersResult.error}`);
          setCheersFile(null);
          return;
        }
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h3 className="min-w-0 truncate text-lg font-semibold">
            Edit “{song.title}”
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <p className="text-sm text-stone-600">
            Drag the window to the best part of the song (~1 minute).
          </p>
          <SegmentPicker
            durationMs={song.durationMs}
            seg1={seg1}
            seg2={seg2}
            onChange={(s1, s2) => {
              setSeg1(s1);
              setSeg2(s2);
            }}
          />

          <div>
            <p className="mb-2 text-sm font-medium">
              Where does it belong in the mix?
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(placementLabels) as Placement[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlacement(placement === p ? null : p)}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    placement === p
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-300 hover:bg-stone-100"
                  }`}
                >
                  {placementLabels[p]}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Optional note — “late song for when people are hyped”"
              className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2.5 text-base sm:text-sm"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              Cheers recording{" "}
              <span className="font-normal text-stone-500">
                {hasCheers ? "(recording a new one replaces it)" : "(optional)"}
              </span>
            </p>
            {hasCheers && !cheersFile && (
              <div className="mb-3 flex items-center gap-3">
                <audio
                  src={`/api/klub100/cheers/${song.id}`}
                  controls
                  preload="none"
                  className="h-9 w-44 max-w-full"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={dropCheers}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            )}
            <CheersCapture value={cheersFile} onChange={setCheersFile} />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-stone-200 p-4">
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="w-full rounded-md bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
