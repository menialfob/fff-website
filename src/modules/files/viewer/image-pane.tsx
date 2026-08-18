"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileDTO } from "../types";
import { fileUrl, thumbUrl } from "../types";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const panStart = useRef<{ pointer: Point; offset: Point } | null>(null);
  const lastTap = useRef(0);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!active) reset();
  }, [active, reset]);

  useEffect(() => {
    onZoomChange(scale > 1.01);
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
      onDoubleClick={() => zoomTo(zoomed ? 1 : DOUBLE_TAP_SCALE)}
      className="flex h-full w-full touch-none items-center justify-center overflow-hidden"
      style={{ cursor: zoomed ? "grab" : "zoom-in" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic media route */}
      <img
        src={active ? fileUrl(file.id) : thumbUrl(file)}
        alt={file.name}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          transition: panStart.current || pinchStart.current ? "none" : "transform 200ms",
        }}
        className="max-h-full max-w-full select-none object-contain"
      />
    </div>
  );
}
