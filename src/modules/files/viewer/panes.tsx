"use client";

import { useI18n } from "@/lib/i18n/client";
import { formatSize } from "@/lib/format";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import { SaveButton } from "@/components/save-button";
import { useIsStandalone } from "@/lib/download";
import { KindIcon, kindLabel } from "../kind-icon";
import type { FileDTO } from "../types";
import { downloadUrl, fileUrl, thumbUrl } from "../types";

/**
 * The non-image viewer panes. Each one is only mounted while its file is the
 * active slide, so no off-screen video ever buffers or plays.
 */

/**
 * Video and audio, played by the browser's own controls — they are the ones
 * members already know, they get picture-in-picture and AirPlay for free, and
 * on iOS the native fullscreen player is better than anything we would build.
 * Scrubbing works because the media route answers byte ranges.
 */
export function MediaPane({ file }: { file: FileDTO }) {
  const { t } = useI18n();

  if (file.kind === "AUDIO") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-400 to-cyan-500 shadow-2xl shadow-cyan-500/20">
          <KindIcon kind={file.kind} name={file.name} className="h-14 w-14 text-zinc-950" />
        </div>
        <p className="max-w-sm break-words text-center text-sm text-zinc-300">
          {file.name}
        </p>
        <audio
          src={fileUrl(file.id)}
          controls
          autoPlay
          className="w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <video
        src={fileUrl(file.id)}
        poster={file.hasThumb ? thumbUrl(file) : undefined}
        controls
        autoPlay
        playsInline
        preload="metadata"
        aria-label={file.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full"
      >
        {t.files.noPreview}
      </video>
    </div>
  );
}

/**
 * PDFs, embedded with the browser's own viewer. Safari on iOS only renders the
 * first page inside an iframe, so the "open in a new tab" escape hatch is shown
 * permanently rather than hidden behind a failure we cannot reliably detect.
 */
export function PdfPane({ file }: { file: FileDTO }) {
  const { t } = useI18n();
  const standalone = useIsStandalone();
  return (
    <div
      className="flex h-full w-full flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <iframe
        src={fileUrl(file.id)}
        title={file.name}
        className="min-h-0 flex-1 rounded-xl bg-white"
      />
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 pt-3">
        <p className="w-full text-center text-xs text-zinc-500">
          {t.files.pdfFallback}
        </p>
        {/* A new tab is a genuine escape in a browser, but inside the
            installed app it strands the member — the share sheet covers
            "open this in Books" there instead. */}
        {!standalone && (
          <a
            href={fileUrl(file.id)}
            target="_blank"
            rel="noreferrer"
            className={btnSecondary}
          >
            <ExternalLinkIcon className="h-4 w-4" />
            {t.files.openInNewTab}
          </a>
        )}
        <SaveButton
          variant="button"
          url={downloadUrl(file.id)}
          name={file.name}
          mimeType={file.mimeType}
          size={file.size}
          className={btnSecondary}
        />
      </div>
    </div>
  );
}

/**
 * Office documents and anything else the browser cannot render: a card with
 * everything worth knowing about the file and the two things you can actually
 * do with it. Rendering .docx/.xlsx in-page would mean shipping a converter
 * and still losing the layout, so this hands off to the device's own apps.
 */
export function DocCard({ file }: { file: FileDTO }) {
  const { t, fmt, formatDate, locale } = useI18n();
  const standalone = useIsStandalone();
  return (
    <div
      className="flex h-full w-full items-center justify-center p-6"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.06]">
          <KindIcon kind={file.kind} name={file.name} className="h-10 w-10" />
        </div>
        <p className="break-words font-semibold text-zinc-100">{file.name}</p>
        <p className="mt-1 text-sm text-zinc-500">
          {kindLabel(t, file)} · {formatSize(file.size)}
        </p>
        <p className="mt-0.5 text-sm text-zinc-500">
          {fmt(t.files.uploadedBy, { name: file.uploadedByName })} ·{" "}
          {formatDate(new Date(file.createdAt), locale)}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <SaveButton
            variant="button"
            url={downloadUrl(file.id)}
            name={file.name}
            mimeType={file.mimeType}
            size={file.size}
            className={btnPrimary}
          />
          {!standalone && (
            <a
              href={fileUrl(file.id)}
              target="_blank"
              rel="noreferrer"
              className={btnSecondary}
            >
              <ExternalLinkIcon className="h-4 w-4" />
              {t.files.open}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
