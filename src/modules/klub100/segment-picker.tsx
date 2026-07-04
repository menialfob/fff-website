"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { PlusIcon } from "@/components/icons";
import {
  DEFAULT_SEGMENT_MS,
  formatMs,
  MIN_SEGMENT_MS,
  parseTime,
} from "./shared";

export type Segment = { startMs: number; endMs: number };

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
  chorusRegions,
}: {
  durationMs: number;
  seg1: Segment;
  seg2: Segment | null;
  onChange: (seg1: Segment, seg2: Segment | null) => void;
  /** Detected chorus windows, shown as faint bands under the segments. */
  chorusRegions?: { startMs: number; endMs: number }[];
}) {
  const { t, fmt } = useI18n();
  const barRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const clamp = (ms: number) =>
    Math.min(Math.max(Math.round(ms), 0), durationMs);

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
      const start = Math.min(
        Math.max(ms - drag.grabOffsetMs, 0),
        durationMs - length,
      );
      updateSegment(drag.seg, {
        startMs: clamp(start),
        endMs: clamp(start + length),
      });
    }
  };

  const shift = (which: 1 | 2, deltaMs: number) => {
    const current = which === 1 ? seg1 : seg2!;
    const length = current.endMs - current.startMs;
    const start = Math.min(
      Math.max(current.startMs + deltaMs, 0),
      durationMs - length,
    );
    updateSegment(which, { startMs: clamp(start), endMs: clamp(start + length) });
  };

  const addSecondSegment = () => {
    const start = Math.min(
      seg1.endMs + 30_000,
      Math.max(durationMs - DEFAULT_SEGMENT_MS, 0),
    );
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
        className="relative h-12 touch-none rounded-xl bg-white/10"
      >
        {chorusRegions?.map((region, i) => (
          <div
            key={i}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 rounded-lg bg-fuchsia-400/15 ring-1 ring-inset ring-fuchsia-300/25"
            style={{
              left: `${(region.startMs / durationMs) * 100}%`,
              width: `${((region.endMs - region.startMs) / durationMs) * 100}%`,
            }}
          />
        ))}
        {segments.map(({ which, seg }) => (
          <div
            key={which}
            onPointerDown={(e) => handlePointerDown(e, which, "body")}
            className={`absolute inset-y-0 cursor-grab rounded-lg bg-gradient-to-r shadow-lg ${
              which === 1
                ? "from-amber-400/90 to-orange-500/90 shadow-orange-500/20"
                : "from-fuchsia-500/90 to-pink-500/90 shadow-pink-500/20"
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
              <div className="absolute left-3 inset-y-1 w-1.5 rounded bg-zinc-950/60" />
            </div>
            <div
              onPointerDown={(e) => handlePointerDown(e, which, "end")}
              className="absolute -right-3 inset-y-0 w-7 cursor-ew-resize"
            >
              <div className="absolute right-3 inset-y-1 w-1.5 rounded bg-zinc-950/60" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>0:00</span>
        <span>{formatMs(durationMs)}</span>
      </div>

      {segments.map(({ which, seg }) => (
        <div
          key={which}
          className="mt-3 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="font-medium text-zinc-200">
            {seg2 ? fmt(t.klub100.minuteN, { n: which }) : t.klub100.segment}
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
          <span className="text-zinc-500">–</span>
          <TimeField
            value={seg.endMs}
            onCommit={(ms) =>
              updateSegment(which, {
                startMs: seg.startMs,
                endMs: Math.max(clamp(ms), seg.startMs + MIN_SEGMENT_MS),
              })
            }
          />
          <span className="text-zinc-500">
            ({formatMs(seg.endMs - seg.startMs)})
          </span>
          <span className="flex gap-1">
            {[-5000, -1000, 1000, 5000].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => shift(which, delta)}
                className="min-w-11 cursor-pointer rounded-lg border border-white/15 px-2 py-2 text-xs text-zinc-300 transition hover:bg-white/10"
              >
                {delta > 0 ? `+${delta / 1000}s` : `${delta / 1000}s`}
              </button>
            ))}
          </span>
          {which === 2 && (
            <button
              type="button"
              onClick={() => onChange(seg1, null)}
              className="cursor-pointer text-xs text-red-300 hover:text-red-200 hover:underline"
            >
              {t.common.remove}
            </button>
          )}
        </div>
      ))}

      {!seg2 && durationMs > 2 * DEFAULT_SEGMENT_MS && (
        <button
          type="button"
          onClick={addSecondSegment}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
        >
          <PlusIcon className="h-4 w-4" />
          {t.klub100.addSecondMinute}
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
      className="w-16 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-2 text-center text-sm text-zinc-100"
      aria-label="time"
    />
  );
}
