"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { SaveButton } from "@/components/save-button";
import type { AttachmentDTO } from "@/lib/realtime";
import { ImageViewer } from "./image-viewer";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Renders a message's attachments: images/GIFs as a tappable grid opening the
 * full-screen viewer, other files as download rows. Thumbnails sit on top of
 * their blur placeholder so layout never jumps while they load.
 */
export function AttachmentView({
  attachments,
}: {
  attachments: AttachmentDTO[];
}) {
  const { t } = useI18n();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const visual = attachments.filter((a) => a.kind !== "FILE");
  const files = attachments.filter((a) => a.kind === "FILE");

  return (
    <div className="mt-1 space-y-1.5">
      {visual.length > 0 && (
        <div
          className={
            visual.length === 1
              ? "max-w-xs"
              : "grid max-w-sm grid-cols-2 gap-1.5"
          }
        >
          {visual.map((a, i) => {
            const ratio =
              a.width && a.height ? `${a.width} / ${a.height}` : "4 / 3";
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setViewerIndex(i)}
                className="block w-full overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]"
                style={{
                  aspectRatio: visual.length === 1 ? ratio : "1 / 1",
                  backgroundImage: a.blurData ? `url(${a.blurData})` : undefined,
                  backgroundSize: "cover",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic media route */}
                <img
                  src={
                    // Animated GIFs must play in the thread, so no static thumb.
                    a.kind === "GIF" ? a.url : (a.thumbUrl ?? a.url)
                  }
                  alt={a.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            );
          })}
        </div>
      )}

      {files.map((a) => (
        <div
          key={a.id}
          className="flex max-w-xs items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
        >
          <span aria-hidden className="text-lg">
            📄
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-zinc-100">
              {a.name}
            </span>
            <span className="block text-xs text-zinc-500">
              {formatSize(a.size)} · {t.chat.download}
            </span>
          </span>
          <SaveButton
            url={a.url}
            name={a.name}
            mimeType={a.mimeType}
            size={a.size}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50"
          />
        </div>
      ))}

      {viewerIndex !== null && (
        <ImageViewer
          images={visual}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
