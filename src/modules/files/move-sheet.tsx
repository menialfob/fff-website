"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { Sheet } from "@/components/sheet";
import { btnPrimary, btnSecondary, errorText } from "@/components/ui";
import { ChevronRightIcon, FolderIcon } from "@/components/icons";
import type { FolderDTO } from "./types";

/**
 * Destination picker for a move. Browses the folder tree one level at a time —
 * on a phone that beats an indented tree, which needs horizontal room nobody
 * has — and moves into whichever folder is currently open.
 *
 * `excludeIds` keeps a folder from being offered its own subtree as a
 * destination; the server rejects it too, but the UI should not offer a choice
 * that is going to fail.
 */
export function MoveSheet({
  open,
  onClose,
  folders,
  excludeIds = [],
  onMove,
}: {
  open: boolean;
  onClose: () => void;
  /** Every USER folder in the site, flat; the tree is built from parentId. */
  folders: FolderDTO[];
  excludeIds?: string[];
  onMove: (destinationId: string | null) => Promise<{ error?: string } | void>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const blocked = useMemo(() => new Set(excludeIds), [excludeIds]);
  const children = folders.filter(
    (f) => f.parentId === current && !blocked.has(f.id),
  );
  const trail = useMemo(() => {
    const crumbs: FolderDTO[] = [];
    let id = current;
    while (id) {
      const folder = folders.find((f) => f.id === id);
      if (!folder) break;
      crumbs.unshift(folder);
      id = folder.parentId;
    }
    return crumbs;
  }, [current, folders]);

  const close = () => {
    setCurrent(null);
    setError(undefined);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t.files.moveTitle}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {error && <p className={`${errorText} flex-1`}>{error}</p>}
          <button type="button" onClick={close} className={btnSecondary}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await onMove(current);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                router.refresh();
                close();
              })
            }
            className={btnPrimary}
          >
            {isPending ? t.common.saving : t.files.moveHere}
          </button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => setCurrent(null)}
          className="cursor-pointer rounded-lg px-1.5 py-1 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
        >
          {t.files.moveToRoot}
        </button>
        {trail.map((folder) => (
          <span key={folder.id} className="flex items-center gap-1">
            <ChevronRightIcon className="h-4 w-4 text-zinc-600" />
            <button
              type="button"
              onClick={() => setCurrent(folder.id)}
              className="max-w-[40vw] cursor-pointer truncate rounded-lg px-1.5 py-1 text-zinc-200 transition hover:bg-white/5"
            >
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      {children.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-zinc-500">
          {t.files.noFolders}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10">
          {children.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                onClick={() => setCurrent(folder.id)}
                className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition hover:bg-white/5"
              >
                <FolderIcon className="h-5 w-5 shrink-0 text-sky-300" />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                  {folder.name}
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
