"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, errorText, linkDanger, listCard } from "@/components/ui";
import { addProjectAdmin, removeProjectAdmin } from "./actions";

type Member = { id: string; name: string };

/**
 * Curator-only panel to grant/revoke project-admin rights to site members.
 * The creator is always an implicit admin and is shown but not removable —
 * unless their account has been deleted, in which case the mix has no creator
 * left and the row is dropped.
 */
export function ProjectAdminManager({
  projectId,
  creator,
  adminUserIds,
  members,
}: {
  projectId: string;
  creator: Member | null;
  adminUserIds: string[];
  members: Member[];
}) {
  const { t } = useI18n();
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
    .filter((m) => m.id !== creator?.id && !adminIdSet.has(m.id))
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
      <h2 className="text-xl font-semibold text-white">
        {t.klub100.projectAdmins}
      </h2>
      <p className="mb-3 mt-1 text-sm text-zinc-400">
        {t.klub100.projectAdminsHint}
      </p>

      <ul className={listCard}>
        {creator && (
          <li className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 truncate font-medium text-zinc-100">
              {creator.name}
            </span>
            <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs text-amber-300">
              {t.klub100.creator}
            </span>
          </li>
        )}
        {admins.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 truncate font-medium text-zinc-100">
              {m.name}
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => removeProjectAdmin(projectId, m.id))}
              className={`${linkDanger} shrink-0`}
            >
              {t.common.remove}
            </button>
          </li>
        ))}
      </ul>

      {addable.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-base text-zinc-100 sm:text-sm"
          >
            <option value="">{t.klub100.addMemberPlaceholder}</option>
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
            className={btnPrimary}
          >
            {t.klub100.addAdmin}
          </button>
        </div>
      )}

      {error && (
        <p className={`${errorText} mt-2`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
