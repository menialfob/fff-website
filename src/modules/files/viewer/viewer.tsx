"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/client";
import { formatSize } from "@/lib/format";
import { XIcon } from "@/components/icons";
import { SaveButton } from "@/components/save-button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { ImagePane } from "./image-pane";
import { DocCard, MediaPane, PdfPane } from "./panes";
import { TextPane } from "./text-pane";
import { isTextLike } from "../kind";
import type { FileDTO } from "../types";
import { downloadUrl } from "../types";

/**
 * Full-screen media viewer.
 *
 * Behaves the way a phone gallery is expected to: swipe sideways for the next
 * file, flick down to dismiss, tap the chrome away. Arrow keys and Escape do
 * the same on a desktop. The image pane owns pinch-zoom, and while it is
 * zoomed it tells us so, because a pan and a page-turn are the same gesture
 * and only one of them can win.
 */

/** Horizontal travel that commits to the next file. */
const PAGE_PX = 60;
/** Vertical travel that dismisses. */
const DISMISS_PX = 120;

/**
 * The nearest ancestor that actually has somewhere to scroll. Panes that hold
 * a long document (text, Markdown) own their vertical gestures; the viewer
 * only takes over once they are back at the top.
 */
function scrollableUnder(target: Element | null): HTMLElement | null {
  let node = target instanceof HTMLElement ? target : null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function Viewer({
  files,
  initialIndex,
  onClose,
}: {
  files: FileDTO[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  // The scrollable pane a gesture started in, if any.
  const scroller = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(
    () => setIndex((i) => Math.min(files.length - 1, i + 1)),
    [files.length],
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

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const file = files[index];

  // Warm the neighbours so a swipe lands on a decoded image, not a spinner.
  useEffect(() => {
    for (const neighbour of [files[index - 1], files[index + 1]]) {
      if (neighbour?.kind === "IMAGE") {
        const img = new Image();
        img.src = `/api/files/${neighbour.id}`;
      }
    }
  }, [files, index]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoomed || e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    scroller.current = scrollableUnder(e.target as Element | null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    // Commit to one axis on the first meaningful movement, so a slightly
    // diagonal swipe does not both page and dismiss.
    if (!axis.current && Math.hypot(dx, dy) > 10) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (!axis.current) return;

    // A vertical drag inside something that scrolls belongs to that thing: a
    // document is unreadable if pulling it down dismisses the viewer instead
    // of scrolling back up. Bailing out leaves the browser to scroll
    // natively, rather than a state update and an ancestor transform on every
    // frame fighting it.
    //
    // There is no pull-to-dismiss inside such a pane, and there cannot be:
    // once a touch starts scrolling, the browser claims it and sends us
    // pointercancel after a single move. Documents close with the ✕, Escape
    // or the backdrop instead — scrolling is what they are actually for.
    if (axis.current === "y" && scroller.current) return;

    setDrag(
      axis.current === "x"
        ? { x: dx, y: 0 }
        : { x: 0, y: Math.max(0, dy) },
    );
  };

  const onPointerUp = () => {
    const current = drag;
    start.current = null;
    axis.current = null;
    scroller.current = null;
    setDrag(null);
    if (!current) return;
    if (current.y > DISMISS_PX) onClose();
    else if (current.x < -PAGE_PX) next();
    else if (current.x > PAGE_PX) prev();
  };

  if (!mounted || !file) return null;

  // Dragging down fades the backdrop out, so dismissal feels like a physical
  // pull rather than a state change.
  const dismissProgress = drag ? Math.min(1, drag.y / (DISMISS_PX * 2)) : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      style={{ backgroundColor: `rgba(0,0,0,${0.97 - dismissProgress * 0.5})` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <header className="flex shrink-0 items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.files.viewerClose}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition hover:bg-white/10"
        >
          <XIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium text-zinc-100">
            {file.name}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {formatSize(file.size)}
            {files.length > 1 &&
              ` · ${fmt(t.files.viewerPosition, {
                index: index + 1,
                total: files.length,
              })}`}
          </p>
        </div>
        <SaveButton
          url={downloadUrl(file.id)}
          name={file.name}
          mimeType={file.mimeType}
          size={file.size}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-50"
        />
      </header>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-2"
        style={{
          transform: drag
            ? `translate(${drag.x}px, ${drag.y}px)`
            : undefined,
          transition: drag ? "none" : "transform 200ms",
        }}
      >
        {file.kind === "IMAGE" ? (
          <ImagePane file={file} active onZoomChange={setZoomed} />
        ) : file.kind === "VIDEO" || file.kind === "AUDIO" ? (
          <MediaPane file={file} />
        ) : file.kind === "PDF" ? (
          <PdfPane file={file} />
        ) : isTextLike(file.mimeType, file.name) ? (
          <TextPane file={file} />
        ) : (
          <DocCard file={file} />
        )}

        {index > 0 && (
          <button
            type="button"
            aria-label={t.files.viewerPrev}
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:flex"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        )}
        {index < files.length - 1 && (
          <button
            type="button"
            aria-label={t.files.viewerNext}
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:flex"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      <footer className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-xs text-zinc-500">
        {fmt(t.files.uploadedBy, { name: file.uploadedByName })}
      </footer>
    </div>,
    document.body,
  );
}
