"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { errorText } from "@/components/ui";
import { CheckIcon, XIcon } from "@/components/icons";
import { setAttendance } from "./actions";

export type AttendanceStatus = "GOING" | "MAYBE" | "NOT_GOING";

/** Names of the members registered under each status, for the roster. */
export type AttendanceGroups = Record<AttendanceStatus, string[]>;

const STATUSES: AttendanceStatus[] = ["GOING", "MAYBE", "NOT_GOING"];

// Per-status selected/idle styling. Idle buttons share the neutral chip look;
// the selected one lights up in the status' color so the current choice reads
// at a glance on a phone.
const SELECTED: Record<AttendanceStatus, string> = {
  GOING: "border-lime-400/60 bg-lime-400/15 text-lime-200",
  MAYBE: "border-amber-400/60 bg-amber-400/15 text-amber-200",
  NOT_GOING: "border-red-400/60 bg-red-400/15 text-red-200",
};

/**
 * Attendance registration for a single event instance (identified by `date`).
 * Three toggle buttons — Deltager / Deltager måske / Deltager ikke — plus a
 * roster of who picked what. Clicking the active choice again clears it.
 * Mutations run through the `setAttendance` server action, which revalidates
 * the page so the counts and roster refresh in place.
 */
export function AttendanceControls({
  eventId,
  date,
  myStatus,
  groups,
}: {
  eventId: string;
  date: string;
  myStatus: AttendanceStatus | null;
  groups: AttendanceGroups;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const labels: Record<AttendanceStatus, string> = {
    GOING: t.calendar.attendance.going,
    MAYBE: t.calendar.attendance.maybe,
    NOT_GOING: t.calendar.attendance.notGoing,
  };

  function choose(status: AttendanceStatus) {
    // Re-selecting the current choice clears it.
    const next = myStatus === status ? null : status;
    setError(undefined);
    startTransition(async () => {
      const result = await setAttendance(eventId, date, next);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {STATUSES.map((status) => {
          const selected = myStatus === status;
          const count = groups[status].length;
          return (
            <button
              key={status}
              type="button"
              disabled={isPending}
              aria-pressed={selected}
              onClick={() => choose(status)}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-center text-xs font-medium transition active:scale-[0.98] disabled:opacity-50 ${
                selected
                  ? SELECTED[status]
                  : "border-white/15 text-zinc-300 hover:bg-white/10"
              }`}
            >
              <span className="whitespace-nowrap">{labels[status]}</span>
              <span className="text-[11px] tabular-nums text-zinc-400">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p className={`${errorText} mt-2`} role="alert">
          {error}
        </p>
      )}

      <AttendanceRoster labels={labels} groups={groups} />
    </div>
  );
}

/** Read-only "who's coming" list, grouped by status. */
function AttendanceRoster({
  labels,
  groups,
}: {
  labels: Record<AttendanceStatus, string>;
  groups: AttendanceGroups;
}) {
  const { t } = useI18n();
  const anyone = STATUSES.some((s) => groups[s].length > 0);
  if (!anyone) {
    return (
      <p className="mt-3 text-sm text-zinc-500">{t.calendar.attendance.none}</p>
    );
  }
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {STATUSES.map((status) => (
        <div key={status}>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            {status === "NOT_GOING" ? (
              <XIcon className="h-3.5 w-3.5" />
            ) : (
              <CheckIcon className="h-3.5 w-3.5" />
            )}
            {labels[status]}
          </h4>
          {groups[status].length > 0 ? (
            <ul className="grid gap-0.5 text-sm text-zinc-300">
              {groups[status].map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-600">—</p>
          )}
        </div>
      ))}
    </div>
  );
}
