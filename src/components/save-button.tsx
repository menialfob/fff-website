"use client";

import { useI18n } from "@/lib/i18n/client";
import { formatSize } from "@/lib/format";
import { DownloadIcon } from "@/components/icons";
import { MAX_SAVE_BYTES, saveUrl, useSave } from "@/lib/download";

/**
 * The app's one download control. Everywhere a member can pull bytes down goes
 * through this, because a bare link would navigate the window and — in the
 * installed home-screen app — strand them on iOS's document preview with no way
 * back. See src/lib/download.ts.
 *
 * The label never changes: on a phone the tap opens the native share sheet
 * (Save Image, Save to Files, AirDrop), on a desktop it is an ordinary
 * download. Same button, right behaviour per platform.
 */
export function SaveButton({
  url,
  name,
  mimeType,
  size,
  variant = "icon",
  className,
  onDone,
}: {
  url: string;
  /** Filename the member should end up with. */
  name: string;
  mimeType?: string;
  /** Used to refuse an over-large save before fetching anything. */
  size?: number;
  variant?: "icon" | "button";
  className?: string;
  onDone?: () => void;
}) {
  const { t, fmt } = useI18n();
  const { save, saving, error } = useSave({
    tooLarge: fmt(t.errors.saveTooLarge, { size: formatSize(MAX_SAVE_BYTES) }),
    failed: t.errors.saveFailed,
  });

  const start = () =>
    save(async () => {
      await saveUrl(url, name, { mimeType, size });
      onDone?.();
    });

  if (variant === "icon") {
    return (
      <button
        type="button"
        disabled={saving}
        onClick={(e) => {
          e.stopPropagation();
          start();
        }}
        aria-label={t.files.download}
        title={error ?? t.files.download}
        className={
          className ??
          "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50"
        }
      >
        {saving ? <Spinner /> : <DownloadIcon className="h-5 w-5" />}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-stretch gap-1">
      <button
        type="button"
        disabled={saving}
        onClick={(e) => {
          e.stopPropagation();
          start();
        }}
        className={className}
      >
        {saving ? <Spinner /> : <DownloadIcon className="h-4 w-4" />}
        {saving ? t.common.saving : t.files.download}
      </button>
      {error && (
        <span className="text-xs text-red-300" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={2.5}
        opacity={0.25}
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}
