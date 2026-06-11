"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
    return () => recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const startRecording = async () => {
    setError(undefined);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setError("Recording is not supported in this browser — upload a file instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was denied — upload a file instead.");
      return;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
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
            className="rounded-md bg-red-600 px-4 py-3 text-sm font-medium text-white"
          >
            ■ Stop ({((MAX_RECORD_MS - elapsedMs) / 1000).toFixed(0)}s left)
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="rounded-md bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-700"
          >
            ● Record {value ? "again" : "a cheers"}
          </button>
        )}
        <label className="cursor-pointer rounded-md border border-stone-300 px-4 py-3 text-sm hover:bg-stone-100">
          Upload file
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
            className="text-sm text-red-600 hover:underline"
          >
            Discard
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-stone-500">Max 10 seconds. Skål! 🍻</p>
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
        className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs hover:bg-stone-100"
      >
        {hasCheers ? "Replace cheers" : "🍻 Add cheers"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h3 className="mb-1 text-lg font-semibold">Cheers for “{songTitle}”</h3>
            <p className="mb-4 text-sm text-stone-600">
              {hasCheers
                ? "This replaces the current cheers recording."
                : "Record the cheers that plays before this song."}
            </p>
            <CheersCapture value={file} onChange={setFile} />
            {error && (
              <p className="mt-2 text-sm text-red-600" role="alert">
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
                className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!file || isPending}
                onClick={save}
                className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save cheers"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
