"use client";

import { useRef, useState } from "react";
import { formatMs, parseTime } from "./shared";

export type Segment = { startMs: number; endMs: number };

const MIN_SEGMENT_MS = 10_000;
const DEFAULT_SEGMENT_MS = 60_000;

type DragState = {
  seg: 1 | 2;
  part: "start" | "end" | "body";
  /** Pointer offset from segment start when dragging the body. */
  grabOffsetMs: number;
};

/**
 * Touch-first timeline for picking the ~1 minute segment(s) of a track.
 * Drag the window (or its edge handles) with a finger, fine-tune with the
 * ±buttons, or type exact m:ss times.
 */
export function SegmentPicker({
  durationMs,
  seg1,
  seg2,
  onChange,
}: {
  durationMs: number;
  seg1: Segment;
  seg2: Segment | null;
  onChange: (seg1: Segment, seg2: Segment | null) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const clamp = (ms: number) => Math.min(Math.max(Math.round(ms), 0), durationMs);

  const msFromPointer = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * durationMs);
  };

  const updateSegment = (which: 1 | 2, next: Segment) => {
    if (which === 1) onChange(next, seg2);
    else onChange(seg1, next);
  };

  const handlePointerDown = (
    e: React.PointerEvent,
    seg: 1 | 2,
    part: DragState["part"],
  ) => {
    e.preventDefault();
    e.stopPropagation();
    barRef.current?.setPointerCapture(e.pointerId);
    const current = seg === 1 ? seg1 : seg2!;
    setDrag({
      seg,
      part,
      grabOffsetMs: msFromPointer(e.clientX) - current.startMs,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag || !barRef.current) return;
    const ms = msFromPointer(e.clientX);
    const current = drag.seg === 1 ? seg1 : seg2!;
    const length = current.endMs - current.startMs;

    if (drag.part === "start") {
      updateSegment(drag.seg, {
        startMs: Math.min(ms, current.endMs - MIN_SEGMENT_MS),
        endMs: current.endMs,
      });
    } else if (drag.part === "end") {
      updateSegment(drag.seg, {
        startMs: current.startMs,
        endMs: Math.max(ms, current.startMs + MIN_SEGMENT_MS),
      });
    } else {
      const start = Math.min(Math.max(ms - drag.grabOffsetMs, 0), durationMs - length);
      updateSegment(drag.seg, { startMs: clamp(start), endMs: clamp(start + length) });
    }
  };

  const shift = (which: 1 | 2, deltaMs: number) => {
    const current = which === 1 ? seg1 : seg2!;
    const length = current.endMs - current.startMs;
    const start = Math.min(Math.max(current.startMs + deltaMs, 0), durationMs - length);
    updateSegment(which, { startMs: clamp(start), endMs: clamp(start + length) });
  };

  const addSecondSegment = () => {
    const start = Math.min(seg1.endMs + 30_000, Math.max(durationMs - DEFAULT_SEGMENT_MS, 0));
    onChange(seg1, {
      startMs: clamp(start),
      endMs: clamp(Math.min(start + DEFAULT_SEGMENT_MS, durationMs)),
    });
  };

  const segments: { which: 1 | 2; seg: Segment }[] = [
    { which: 1, seg: seg1 },
    ...(seg2 ? ([{ which: 2, seg: seg2 }] as const) : []),
  ];

  return (
    <div>
      <div
        ref={barRef}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        className="relative h-12 touch-none rounded-lg bg-stone-200"
      >
        {segments.map(({ which, seg }) => (
          <div
            key={which}
            onPointerDown={(e) => handlePointerDown(e, which, "body")}
            className={`absolute inset-y-0 cursor-grab rounded-md ${
              which === 1 ? "bg-amber-400/80" : "bg-orange-400/80"
            }`}
            style={{
              left: `${(seg.startMs / durationMs) * 100}%`,
              width: `${((seg.endMs - seg.startMs) / durationMs) * 100}%`,
            }}
          >
            {/* Edge handles with generous touch targets */}
            <div
              onPointerDown={(e) => handlePointerDown(e, which, "start")}
              className="absolute -left-3 inset-y-0 w-7 cursor-ew-resize"
            >
              <div className="absolute left-3 inset-y-1 w-1.5 rounded bg-stone-900/60" />
            </div>
            <div
              onPointerDown={(e) => handlePointerDown(e, which, "end")}
              className="absolute -right-3 inset-y-0 w-7 cursor-ew-resize"
            >
              <div className="absolute right-3 inset-y-1 w-1.5 rounded bg-stone-900/60" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>0:00</span>
        <span>{formatMs(durationMs)}</span>
      </div>

      {segments.map(({ which, seg }) => (
        <div key={which} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">
            {seg2 ? `Minute ${which}:` : "Segment:"}
          </span>
          <TimeField
            value={seg.startMs}
            onCommit={(ms) =>
              updateSegment(which, {
                startMs: Math.min(clamp(ms), seg.endMs - MIN_SEGMENT_MS),
                endMs: seg.endMs,
              })
            }
          />
          <span>–</span>
          <TimeField
            value={seg.endMs}
            onCommit={(ms) =>
              updateSegment(which, {
                startMs: seg.startMs,
                endMs: Math.max(clamp(ms), seg.startMs + MIN_SEGMENT_MS),
              })
            }
          />
          <span className="text-stone-500">
            ({formatMs(seg.endMs - seg.startMs)})
          </span>
          <span className="flex gap-1">
            {[-5000, -1000, 1000, 5000].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => shift(which, delta)}
                className="min-w-11 rounded-md border border-stone-300 px-2 py-2 text-xs hover:bg-stone-100"
              >
                {delta > 0 ? `+${delta / 1000}s` : `${delta / 1000}s`}
              </button>
            ))}
          </span>
          {which === 2 && (
            <button
              type="button"
              onClick={() => onChange(seg1, null)}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {!seg2 && durationMs > 2 * DEFAULT_SEGMENT_MS && (
        <button
          type="button"
          onClick={addSecondSegment}
          className="mt-3 rounded-md border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100"
        >
          + Add a second minute (really good song)
        </button>
      )}
    </div>
  );
}

/** m:ss input that commits on blur or Enter. Re-syncs when the value changes externally. */
function TimeField({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (ms: number) => void;
}) {
  return (
    <input
      key={value}
      type="text"
      inputMode="numeric"
      defaultValue={formatMs(value)}
      onBlur={(e) => {
        const ms = parseTime(e.target.value);
        if (ms !== null && ms !== value) onCommit(ms);
        else e.target.value = formatMs(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className="w-16 rounded-md border border-stone-300 px-2 py-2 text-center text-sm"
      aria-label="time"
    />
  );
}
