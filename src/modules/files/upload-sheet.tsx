"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { formatSize } from "@/lib/format";
import { Sheet } from "@/components/sheet";
import { btnPrimary, btnSecondary, errorText } from "@/components/ui";
import {
  AlertTriangleIcon,
  CheckIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";
import { notifyUploads } from "./actions";
import { uploadFile } from "./upload-client";
import { MAX_FILE_SIZE } from "./types";

/** Uploads in flight at once. Enough to saturate a phone's uplink, not enough
 *  to starve any single file of bandwidth and make progress look stalled. */
const CONCURRENCY = 3;

type Status = "waiting" | "uploading" | "done" | "failed" | "cancelled";

type Job = {
  id: number;
  file: File;
  status: Status;
  progress: number;
  error?: string;
  controller?: AbortController;
};

let nextJobId = 0;

/**
 * Multi-file upload sheet. Every file is its own job with its own progress,
 * cancel and retry, so one failure in a batch of twenty never costs the other
 * nineteen. One push notification is sent when the whole queue settles.
 */
export function UploadSheet({
  open,
  onClose,
  folderId,
  capture,
}: {
  open: boolean;
  onClose: () => void;
  folderId: string | null;
  /** Open the camera straight away instead of the file picker. */
  capture?: boolean;
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const running = useRef(0);
  // Uploads are fire-and-forget against a ref, so the runner never reads a
  // stale copy of the queue from a closure.
  const queue = useRef<Job[]>([]);
  queue.current = jobs;

  const update = useCallback((id: number, patch: Partial<Job>) => {
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  }, []);

  const runJob = useCallback(
    async (job: Job) => {
      const controller = new AbortController();
      update(job.id, {
        status: "uploading",
        progress: 0,
        error: undefined,
        controller,
      });
      try {
        await uploadFile(job.file, {
          folderId,
          signal: controller.signal,
          onProgress: (fraction) => update(job.id, { progress: fraction }),
        });
        update(job.id, { status: "done", progress: 1, controller: undefined });
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        update(job.id, {
          status: aborted ? "cancelled" : "failed",
          controller: undefined,
          error: aborted ? undefined : t.errors.uploadFailed,
        });
      } finally {
        running.current -= 1;
      }
    },
    [folderId, t.errors.uploadFailed, update],
  );

  // Pump the queue whenever a slot frees up or new files arrive.
  useEffect(() => {
    if (!open) return;
    const waiting = jobs.filter((j) => j.status === "waiting");
    while (running.current < CONCURRENCY && waiting.length > 0) {
      const job = waiting.shift()!;
      running.current += 1;
      void runJob(job);
    }
  }, [jobs, open, runJob]);

  const settled = jobs.length > 0 && jobs.every((j) => j.status !== "waiting" && j.status !== "uploading");
  const succeeded = jobs.filter((j) => j.status === "done");
  const failed = jobs.filter((j) => j.status === "failed");

  // When the queue drains, refresh the listing and raise a single push.
  const notified = useRef(false);
  useEffect(() => {
    if (!settled || notified.current || succeeded.length === 0) return;
    notified.current = true;
    void notifyUploads(folderId, succeeded.length, succeeded[0].file.name);
    router.refresh();
  }, [settled, succeeded, folderId, router]);

  const add = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    // Oversized files are rejected up front rather than after a long upload.
    const accepted: Job[] = Array.from(files)
      .filter((file) => file.size > 0)
      .map((file) => ({
        id: nextJobId++,
        file,
        status: file.size > MAX_FILE_SIZE ? ("failed" as const) : ("waiting" as const),
        progress: 0,
      }));
    if (accepted.length === 0) return;
    notified.current = false;
    setJobs((current) => [...current, ...accepted]);
  }, []);

  const close = useCallback(() => {
    for (const job of queue.current) job.controller?.abort();
    setJobs([]);
    running.current = 0;
    notified.current = false;
    onClose();
  }, [onClose]);

  // Opening in camera mode goes straight to the capture UI.
  useEffect(() => {
    if (open && capture) cameraRef.current?.click();
  }, [open, capture]);

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t.files.uploadTitle}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={btnSecondary}
          >
            {jobs.length === 0 ? t.files.uploadChoose : t.files.uploadAddMore}
          </button>
          <button type="button" onClick={close} className={btnPrimary}>
            {settled || jobs.length === 0
              ? t.files.uploadClose
              : t.files.uploadCancel}
          </button>
        </div>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {jobs.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center transition ${
            dragging
              ? "border-amber-400/60 bg-amber-400/10"
              : "border-white/15 bg-white/[0.02]"
          }`}
        >
          <UploadIcon className="h-8 w-8 text-zinc-500" />
          <p className="text-sm text-zinc-400">
            <span className="hidden sm:inline">{t.files.uploadDropHint} </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer font-medium text-amber-300 underline underline-offset-2"
            >
              {t.files.uploadChoose}
            </button>
          </p>
          <p className="text-xs text-zinc-600">
            {formatSize(MAX_FILE_SIZE)} max
          </p>
        </div>
      ) : (
        <ul className="space-y-2 pb-1">
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onCancel={() => job.controller?.abort()}
              onRetry={() => update(job.id, { status: "waiting", progress: 0 })}
              onRemove={() =>
                setJobs((current) => current.filter((j) => j.id !== job.id))
              }
            />
          ))}
        </ul>
      )}

      {settled && succeeded.length > 0 && (
        <p className="pt-3 text-sm text-emerald-300">
          {succeeded.length === 1
            ? t.files.uploadQueueDoneOne
            : fmt(t.files.uploadQueueDone, { count: succeeded.length })}
          {failed.length > 0 &&
            ` · ${fmt(t.files.uploadFailedCount, { count: failed.length })}`}
        </p>
      )}
    </Sheet>
  );
}

function JobRow({
  job,
  onCancel,
  onRetry,
  onRemove,
}: {
  job: Job;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const tooBig = job.file.size > MAX_FILE_SIZE;
  const percent = Math.round(job.progress * 100);

  return (
    <li className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-100">
            {job.file.name}
          </span>
          <span className="block text-xs text-zinc-500">
            {formatSize(job.file.size)}
            {job.status === "uploading" && ` · ${percent}%`}
            {job.status === "waiting" && ` · ${t.files.uploadWaiting}`}
            {job.status === "done" && ` · ${t.files.uploadDone}`}
            {job.status === "cancelled" && ` · ${t.files.uploadCancel}`}
          </span>
        </span>

        {job.status === "done" && (
          <CheckIcon className="h-5 w-5 shrink-0 text-emerald-400" />
        )}
        {(job.status === "failed" || tooBig) && (
          <AlertTriangleIcon className="h-5 w-5 shrink-0 text-red-400" />
        )}
        {job.status === "uploading" && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t.files.uploadCancel}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
        {(job.status === "failed" || job.status === "cancelled") && !tooBig && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 cursor-pointer text-sm font-medium text-amber-300 hover:underline"
          >
            {t.files.uploadRetry}
          </button>
        )}
        {(tooBig || job.status === "done") && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t.common.remove}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {job.status === "uploading" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-150"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {tooBig && (
        <p className={`${errorText} mt-1`}>{t.errors.fileTooLarge}</p>
      )}
      {job.error && !tooBig && (
        <p className={`${errorText} mt-1`}>{job.error}</p>
      )}
    </li>
  );
}
