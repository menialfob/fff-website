"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { ChevronRightIcon, FolderIcon } from "@/components/icons";
import type { Crumb } from "./types";

/**
 * Root-first trail to the current folder. Deep trails collapse in the middle
 * rather than scrolling off a phone screen: the root and the last two hops are
 * what anyone actually navigates by.
 */
const KEEP_TAIL = 2;

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const { t } = useI18n();
  const collapsed = trail.length > KEEP_TAIL + 1;
  const shown = collapsed ? trail.slice(-KEEP_TAIL) : trail;

  return (
    <nav aria-label={t.files.root} className="mb-3 flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
      <Link
        href="/files"
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
      >
        <FolderIcon className="h-4 w-4" />
        {t.files.root}
      </Link>

      {collapsed && (
        <>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600" />
          <span className="shrink-0 px-1 text-zinc-600">…</span>
        </>
      )}

      {shown.map((crumb, i) => {
        const last = i === shown.length - 1;
        return (
          <span key={crumb.id} className="flex min-w-0 shrink-0 items-center gap-1">
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600" />
            {last ? (
              <span
                aria-current="page"
                className="max-w-[45vw] truncate px-1.5 py-1 font-medium text-zinc-100 sm:max-w-none"
              >
                {crumb.name}
              </span>
            ) : (
              <Link
                href={`/files/${crumb.id}`}
                className="max-w-[35vw] truncate rounded-lg px-1.5 py-1 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100 sm:max-w-none"
              >
                {crumb.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
