"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, chip, errorText, input, linkDanger } from "@/components/ui";
import { PencilIcon } from "@/components/icons";
import { attachCheers, editSong, removeCheers } from "./actions";
import { CheersCapture } from "./cheers-recorder";
import { SegmentPicker, type Segment } from "./segment-picker";
import { placements, type Placement, type SongView } from "./shared";

/**
 * Pencil button + dialog to edit an existing suggestion's timing, placement and
 * cheers. Rendered only for the suggestor or a project curator.
 */
export function EditSongButton({ song }: { song: SongView }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10"
      >
        <PencilIcon className="h-3.5 w-3.5" />
        {t.common.edit}
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
  const { t, fmt } = useI18n();
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
          setError(
            fmt(t.klub100.timingSavedCheersFailed, {
              error: cheersResult.error,
            }),
          );
          setCheersFile(null);
          return;
        }
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col bg-panel sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="min-w-0 truncate text-lg font-semibold text-white">
            {fmt(t.klub100.editSongTitle, { title: song.title })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={`${btnSecondary} min-h-9 shrink-0 px-3 py-1.5`}
          >
            {t.common.close}
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <p className="text-sm text-zinc-400">{t.klub100.dragHint}</p>
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
            <p className="mb-2 text-sm font-medium text-zinc-200">
              {t.klub100.whereInMix}
            </p>
            <div className="flex flex-wrap gap-2">
              {placements.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlacement(placement === p ? null : p)}
                  className={chip(placement === p)}
                >
                  {t.klub100.placements[p]}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder={t.klub100.notePlaceholder}
              className={`${input} mt-2`}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-zinc-200">
              {t.klub100.cheersRecording}{" "}
              <span className="font-normal text-zinc-500">
                {hasCheers ? t.klub100.cheersReplaces : t.klub100.cheersOptional}
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
                  className={linkDanger}
                >
                  {t.common.remove}
                </button>
              </div>
            )}
            <CheersCapture value={cheersFile} onChange={setCheersFile} />
          </div>

          {error && (
            <p className={errorText} role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className={`${btnPrimary} w-full py-3`}
          >
            {isPending ? t.common.saving : t.klub100.saveChanges}
          </button>
        </div>
      </div>
    </div>
  );
}
