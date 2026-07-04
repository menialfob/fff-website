"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, errorText, linkDanger } from "@/components/ui";
import { BeerIcon, MicIcon, StopIcon, UploadIcon } from "@/components/icons";
import { attachCheers } from "./actions";
import { trimSilence } from "./trim-silence";

const MAX_RECORD_MS = 10_000;

function extensionFor(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "audio";
}

/**
 * Record-or-upload widget holding a pending cheers clip. Used inside the
 * cheers dialog and the suggest-song flow.
 */
export function CheersCapture({
  value,
  onChange,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
}) {
  const { t, fmt } = useI18n();
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string>();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    if (!value) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  // Stop the recorder (and mic) if the component unmounts mid-recording.
  useEffect(() => {
    return () =>
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  const startRecording = async () => {
    setError(undefined);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setError(t.klub100.recordingUnsupported);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t.klub100.micDenied);
      return;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      const raw = new File([blob], `cheers.${extensionFor(type)}`, { type });
      // Cut the hesitation between pressing record and saying "skål" —
      // conservative, and falls back to the raw take on any trouble.
      onChange(await trimSilence(raw));
      setRecording(false);
    };
    recorder.start();
    setRecording(true);

    const startedAt = Date.now();
    setElapsedMs(0);
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORD_MS && recorder.state === "recording") {
        recorder.stop();
      }
      if (recorder.state !== "recording") clearInterval(tick);
    }, 100);
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/25"
          >
            <StopIcon className="h-4 w-4" />
            {fmt(t.klub100.stopRecording, {
              seconds: ((MAX_RECORD_MS - elapsedMs) / 1000).toFixed(0),
            })}
          </button>
        ) : (
          <button type="button" onClick={startRecording} className={btnPrimary}>
            <MicIcon className="h-4 w-4" />
            {value ? t.klub100.recordAgain : t.klub100.recordCheers}
          </button>
        )}
        <label className={`${btnSecondary} cursor-pointer`}>
          <UploadIcon className="h-4 w-4" />
          {t.klub100.uploadFile}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChange(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {previewUrl && (
        <div className="flex items-center gap-3">
          <audio src={previewUrl} controls className="h-10 max-w-full" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className={linkDanger}
          >
            {t.klub100.discard}
          </button>
        </div>
      )}
      {error && (
        <p className={errorText} role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-zinc-500">{t.klub100.maxTenSeconds}</p>
    </div>
  );
}

/** Button + full-screen dialog to attach/replace the cheers of an existing song. */
export function CheersButton({
  songId,
  songTitle,
  hasCheers,
}: {
  songId: string;
  songTitle: string;
  hasCheers: boolean;
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const save = () => {
    if (!file) return;
    const formData = new FormData();
    formData.set("songId", songId);
    formData.set("file", file);
    startTransition(async () => {
      const result = await attachCheers(formData);
      setError(result?.error);
      if (result?.ok) {
        setFile(null);
        setOpen(false);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10"
      >
        <BeerIcon className="h-3.5 w-3.5" />
        {hasCheers ? t.klub100.replaceCheers : t.klub100.addCheers}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl border-t border-white/10 bg-panel p-5 sm:rounded-2xl sm:border sm:shadow-2xl sm:shadow-black/50">
            <h3 className="mb-1 text-lg font-semibold text-white">
              {fmt(t.klub100.cheersFor, { title: songTitle })}
            </h3>
            <p className="mb-4 text-sm text-zinc-400">
              {hasCheers
                ? t.klub100.cheersReplaceHint
                : t.klub100.cheersRecordHint}
            </p>
            <CheersCapture value={file} onChange={setFile} />
            {error && (
              <p className={`${errorText} mt-2`} role="alert">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setOpen(false);
                }}
                className={btnSecondary}
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={!file || isPending}
                onClick={save}
                className={btnPrimary}
              >
                {isPending ? t.common.saving : t.klub100.saveCheers}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
