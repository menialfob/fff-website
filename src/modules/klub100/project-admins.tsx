"use client";

import { useState, useTransition } from "react";
import { addProjectAdmin, removeProjectAdmin } from "./actions";

type Member = { id: string; name: string };

/**
 * Curator-only panel to grant/revoke project-admin rights to site members.
 * The creator is always an implicit admin and is shown but not removable.
 */
export function ProjectAdminManager({
  projectId,
  creator,
  adminUserIds,
  members,
}: {
  projectId: string;
  creator: Member;
  adminUserIds: string[];
  members: Member[];
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const byId = new Map(members.map((m) => [m.id, m]));
  const admins = adminUserIds
    .map((id) => byId.get(id))
    .filter((m): m is Member => Boolean(m))
    .sort((a, b) => a.name.localeCompare(b.name));

  const adminIdSet = new Set(adminUserIds);
  const addable = members
    .filter((m) => m.id !== creator.id && !adminIdSet.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result?.error);
    });

  const add = () => {
    if (!selected) return;
    const userId = selected;
    setSelected("");
    run(() => addProjectAdmin(projectId, userId));
  };

  return (
    <div>
      <h2 className="text-xl font-semibold">Project admins</h2>
      <p className="mb-3 mt-1 text-sm text-stone-600">
        Admins can edit songs, curate the tracklist and host playback — same as
        you.
      </p>

      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm">
        <li className="flex items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1 truncate font-medium">
            {creator.name}
          </span>
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
            Creator
          </span>
        </li>
        {admins.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => removeProjectAdmin(projectId, m.id))}
              className="shrink-0 text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {addable.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-h-11 flex-1 rounded-md border border-stone-300 px-3 py-2 text-base sm:text-sm"
          >
            <option value="">Add a member…</option>
            {addable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selected || isPending}
            onClick={add}
            className="min-h-11 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            Add admin
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
