"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { AttachmentDTO } from "@/lib/realtime";

const SWIPE_PX = 60;

/**
 * Full-screen image viewer for a message's images: swipe (touch) or arrow
 * keys/buttons to move between them, tap the backdrop or ✕ to close.
 */
export function ImageViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: AttachmentDTO[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(initialIndex);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const prev = useCallback(
    () => setIndex((i) => (i > 0 ? i - 1 : i)),
    [],
  );
  const next = useCallback(
    () => setIndex((i) => (i < images.length - 1 ? i + 1 : i)),
    [images.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  const image = images[index];

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStart.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) next();
          else prev();
        }
      }}
    >
      <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-sm text-zinc-400">
          {images.length > 1 ? `${index + 1} / ${images.length}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.chat.imageViewerClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-white transition hover:bg-white/10"
        >
          ✕
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic media route */}
        <img
          key={image.id}
          src={image.url}
          alt={image.name}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
        {index > 0 && (
          <button
            type="button"
            aria-label={t.chat.imageViewerPrev}
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20 md:flex"
          >
            ‹
          </button>
        )}
        {index < images.length - 1 && (
          <button
            type="button"
            aria-label={t.chat.imageViewerNext}
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20 md:flex"
          >
            ›
          </button>
        )}
      </div>

      <p className="truncate p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-zinc-500">
        {image.name}
      </p>
    </div>
  );
}
