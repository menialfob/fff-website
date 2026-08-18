"use client";

import { useState } from "react";
import { formatDuration, formatSize } from "@/lib/format";
import { PlayIcon } from "@/components/icons";
import { SaveButton } from "@/components/save-button";
import { KindIcon, kindTint } from "./kind-icon";
import { Viewer } from "./viewer/viewer";
import type { FileDTO } from "./types";
import { downloadUrl, thumbUrl } from "./types";

/**
 * The files attached to a calendar event or a forum thread, rendered the same
 * way they are in the files section and opening the same viewer — a photo on
 * an event page should behave like a photo, not like a download link.
 *
 * Media goes in a thumbnail grid; documents stay as rows, where the filename
 * is the thing worth reading.
 */
export function AttachmentGrid({ files }: { files: FileDTO[] }) {
  const [index, setIndex] = useState<number | null>(null);
  if (files.length === 0) return null;

  const visual = files.filter((f) => f.hasThumb);
  const rest = files.filter((f) => !f.hasThumb);

  return (
    <div className="space-y-2">
      {visual.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {visual.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => setIndex(files.indexOf(file))}
                style={
                  file.blurData
                    ? {
                        backgroundImage: `url(${file.blurData})`,
                        backgroundSize: "cover",
                      }
                    : undefined
                }
                className="relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] transition hover:border-white/25 active:scale-[0.98]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic media route */}
                <img
                  src={thumbUrl(file)}
                  alt={file.name}
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                {file.kind === "VIDEO" && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                      <PlayIcon className="h-4 w-4 translate-x-px text-white" />
                    </span>
                  </span>
                )}
                {file.durationMs != null && (
                  <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] tabular-nums text-white">
                    {formatDuration(file.durationMs)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {rest.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
        >
          <button
            type="button"
            onClick={() => setIndex(files.indexOf(file))}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          >
            <KindIcon
              kind={file.kind}
              className={`h-5 w-5 shrink-0 ${kindTint(file.kind, file.mimeType, file.name)}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-100">
                {file.name}
              </span>
              <span className="block text-xs text-zinc-500">
                {formatSize(file.size)}
              </span>
            </span>
          </button>
          <SaveButton
            url={downloadUrl(file.id)}
            name={file.name}
            mimeType={file.mimeType}
            size={file.size}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50"
          />
        </div>
      ))}

      {index !== null && (
        <Viewer
          files={files}
          initialIndex={index}
          onClose={() => setIndex(null)}
        />
      )}
    </div>
  );
}
