"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileDTO } from "../types";
import { displayUrl, fileUrl, thumbUrl } from "../types";

/**
 * A zoomable photo. Pinch with two fingers, double-tap (or double-click) to
 * toggle 2.5×, drag to pan once zoomed.
 *
 * Built on pointer events and a CSS transform rather than a gesture library —
 * the whole behaviour is one transform and a handful of pointer positions, and
 * a dependency here would outweigh the code it saves.
 *
 * While zoomed the pane reports `onZoomChange(true)` so the viewer shell stops
 * treating horizontal drags as "next photo": panning and paging must never
 * fight over the same gesture.
 */

const DOUBLE_TAP_SCALE = 2.5;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 300;

type Point = { x: number; y: number };

/**
 * The resolution ladder a photo climbs, cheapest first.
 *
 * Nothing here is about laziness — it is about never showing a half-decoded
 * image. WebKit paints the rows of a JPEG it has not received yet as a solid
 * grey block, so a 10 MB camera original opened with a grey bar across the
 * bottom that crept upward as the bytes landed. Every rung is therefore
 * decoded off-screen first and swapped in only once it can be painted whole.
 *
 *   thumb    the 512px grid tile, already in cache — on screen instantly
 *   display  the 2048px copy, sharp at any sensible phone size
 *   full     the original, which is only worth its megabytes once someone
 *            zooms past what the display copy can resolve
 */
type Tier = "thumb" | "display" | "full";

const RANK: Record<Tier, number> = { thumb: 0, display: 1, full: 2 };

/**
 * Every rung falls back to the original when its rendition does not exist, so
 * a small image simply starts and ends at the same URL and the upgrades below
 * collapse into cache hits.
 */
function srcFor(file: FileDTO, tier: Tier): string {
  if (tier === "full") return fileUrl(file.id);
  if (tier === "display") return displayUrl(file);
  return thumbUrl(file);
}

function startTier(file: FileDTO): Tier {
  if (file.hasThumb) return "thumb";
  if (file.hasDisplay) return "display";
  return "full";
}

/**
 * Fetches one rung out of view and reports it ready. `enabled` gates the
 * climb: the display copy waits for the pane to be the visible one, the
 * original waits for a pinch.
 */
function useRung(
  file: FileDTO,
  tier: Tier,
  enabled: boolean,
  onReady: (tier: Tier) => void,
) {
  // Keyed on the URL, not the DTO: a parent re-render that hands down an equal
  // but freshly built object must not restart the download.
  const src = srcFor(file, tier);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const done = () => {
      if (!cancelled) onReady(tier);
    };
    const loader = new Image();
    loader.src = src;
    // decode() resolves only when the frame is paintable, which is the whole
    // point; onload is the fallback for a browser that will not, or a
    // rejection from one that decodes lazily anyway.
    loader.decode().then(done, () => {
      if (loader.complete && loader.naturalWidth > 0) done();
      else loader.onload = done;
    });
    return () => {
      cancelled = true;
    };
  }, [src, tier, enabled, onReady]);
}

export function ImagePane({
  file,
  active,
  onZoomChange,
}: {
  file: FileDTO;
  /** Only the visible pane reacts to gestures and resets when it leaves. */
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [tier, setTier] = useState<Tier>(() => startTier(file));
  // Latched, so pinching back out mid-download does not abandon the original
  // and leave a zoom-in a moment later waiting all over again.
  const [wantsFull, setWantsFull] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const panStart = useRef<{ pointer: Point; offset: Point } | null>(null);
  const lastTap = useRef(0);

  // A rung that arrives late must never pull the picture back down to a
  // blurrier one, whatever order the two loads happen to finish in.
  const raise = useCallback((next: Tier) => {
    setTier((current) => (RANK[next] > RANK[current] ? next : current));
  }, []);
  useRung(file, "display", active, raise);
  useRung(file, "full", active && wantsFull, raise);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!active) reset();
  }, [active, reset]);

  useEffect(() => {
    const zoomedIn = scale > 1.01;
    onZoomChange(zoomedIn);
    // Zooming is the one moment the original earns its size: the display copy
    // runs out of detail somewhere past 1×, and by then the member has said
    // they want a closer look. The swap is invisible — same element, same
    // aspect, already decoded — so it just gets sharper.
    if (zoomedIn) setWantsFull(true);
  }, [scale, onZoomChange]);

  /** Keeps the image from being dragged off-screen entirely. */
  const clamp = useCallback((next: Point, atScale: number): Point => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return next;
    const maxX = (box.width * (atScale - 1)) / 2;
    const maxY = (box.height * (atScale - 1)) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, []);

  const zoomTo = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_SCALE, Math.max(1, next));
      setScale(clamped);
      if (clamped === 1) setOffset({ x: 0, y: 0 });
      else setOffset((current) => clamp(current, clamped));
    },
    [clamp],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(b.x - a.x, b.y - a.y), scale };
      panStart.current = null;
      return;
    }

    if (pointers.current.size === 1) {
      const now = Date.now();
      // The only place a double-tap is recognised. Pointer events already
      // cover mouse, touch and pen, and pairing this with an onDoubleClick
      // handler was not harmless: the browser synthesises a dblclick after a
      // double-tap too, so both fired for one gesture and the second toggle
      // undid the first — double-tapping to zoom did nothing at all.
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        zoomTo(scale > 1.01 ? 1 : DOUBLE_TAP_SCALE);
        return;
      }
      lastTap.current = now;
      // Panning only matters while zoomed; otherwise the shell owns the drag.
      if (scale > 1.01) {
        panStart.current = { pointer: { x: e.clientX, y: e.clientY }, offset };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      zoomTo((distance / pinchStart.current.distance) * pinchStart.current.scale);
      return;
    }

    if (panStart.current) {
      const next = {
        x: panStart.current.offset.x + (e.clientX - panStart.current.pointer.x),
        y: panStart.current.offset.y + (e.clientY - panStart.current.pointer.y),
      };
      setOffset(clamp(next, scale));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  };

  const zoomed = scale > 1.01;

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      className="flex h-full w-full touch-none items-center justify-center overflow-hidden"
      style={{ cursor: zoomed ? "grab" : "zoom-in" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic media route */}
      <img
        src={srcFor(file, tier)}
        alt={file.name}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          transition: panStart.current || pinchStart.current ? "none" : "transform 200ms",
          // Sized from the original's intrinsics rather than whichever rung is
          // loaded, so climbing the ladder changes only sharpness. Without
          // this a 512px thumbnail would lay itself out 512px wide and the
          // photo would visibly jump when the bigger copy arrived.
          maxWidth: file.width ?? undefined,
          maxHeight: file.height ?? undefined,
        }}
        className="h-full w-full select-none object-contain"
      />
    </div>
  );
}
