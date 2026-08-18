"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { formatDuration, formatSize } from "@/lib/format";
import { FolderIcon, MoreVerticalIcon, PlayIcon } from "@/components/icons";
import { KindIcon, kindTint } from "./kind-icon";
import type { FileDTO, FolderDTO } from "./types";
import { thumbUrl } from "./types";

/**
 * The four ways a folder or a file is drawn: as a grid tile or a list row.
 * Both layouts share selection, the overflow menu and long-press, so the
 * browser only has to decide which one to render.
 */

/** Holding an item enters selection mode, the standard touch equivalent of
 *  right-clicking. Shorter than iOS's own ~500 ms so it feels responsive. */
const LONG_PRESS_MS = 420;

type PressHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

export function useLongPress(onLongPress: () => void): PressHandlers {
  // The timer has to survive re-renders: a render between pointerdown and
  // pointerup would otherwise orphan it and fire the press after the tap.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => clear, [clear]);

  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") return;
      clear();
      timer.current = setTimeout(onLongPress, LONG_PRESS_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onContextMenu: (e) => {
      e.preventDefault();
      onLongPress();
    },
  };
}

function SelectionDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${
        selected
          ? "border-amber-400 bg-amber-400 text-zinc-950"
          : "border-white/60 bg-black/40"
      }`}
    >
      {selected && (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      )}
    </span>
  );
}

/* --- folders --------------------------------------------------------------- */

export function FolderTile({
  folder,
  onMenu,
}: {
  folder: FolderDTO;
  onMenu?: () => void;
}) {
  const { t, fmt } = useI18n();
  const count = folder.fileCount + folder.folderCount;
  return (
    <div className="group relative">
      <Link
        href={`/files/${folder.id}`}
        className="flex aspect-square flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-white/20 hover:bg-white/[0.07] active:scale-[0.98]"
      >
        <FolderIcon className="h-7 w-7 text-sky-300" />
        <span className="min-w-0">
          <span className="line-clamp-2 break-words text-sm font-medium text-zinc-100">
            {folder.name}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-500">
            {count === 0
              ? t.files.emptyFolderShort
              : folder.fileCount === 1 && folder.folderCount === 0
                ? t.files.fileCountOne
                : fmt(t.files.fileCount, { count })}
          </span>
        </span>
      </Link>
      {onMenu && <MenuButton label={folder.name} onClick={onMenu} />}
    </div>
  );
}

export function FolderRow({
  folder,
  onMenu,
}: {
  folder: FolderDTO;
  onMenu?: () => void;
}) {
  const { t, fmt } = useI18n();
  const count = folder.fileCount + folder.folderCount;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Link
        href={`/files/${folder.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
          <FolderIcon className="h-5 w-5 text-sky-300" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-zinc-100">
            {folder.name}
          </span>
          <span className="block text-xs text-zinc-500">
            {count === 0
              ? t.files.emptyFolderShort
              : fmt(t.files.fileCount, { count })}
          </span>
        </span>
      </Link>
      {onMenu && <MenuButton label={folder.name} onClick={onMenu} inline />}
    </li>
  );
}

/* --- files ----------------------------------------------------------------- */

export function FileTile({
  file,
  selecting,
  selected,
  onOpen,
  onToggle,
  onMenu,
}: {
  file: FileDTO;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onMenu: () => void;
}) {
  const press = useLongPress(onToggle);
  const showThumb = file.hasThumb;

  return (
    <div className="group relative">
      <button
        type="button"
        {...press}
        onClick={() => (selecting ? onToggle() : onOpen())}
        style={
          file.blurData
            ? { backgroundImage: `url(${file.blurData})`, backgroundSize: "cover" }
            : undefined
        }
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border bg-white/[0.04] transition active:scale-[0.98] ${
          selected
            ? "border-amber-400 ring-2 ring-amber-400/40"
            : "border-white/10 hover:border-white/20"
        }`}
      >
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic media route
          <img
            src={thumbUrl(file)}
            alt={file.name}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full flex-col justify-between p-3 text-left">
            <KindIcon
              kind={file.kind}
              name={file.name}
              className={`h-7 w-7 ${kindTint(file.kind, file.mimeType, file.name)}`}
            />
            <span className="line-clamp-3 break-words text-xs font-medium text-zinc-300">
              {file.name}
            </span>
          </span>
        )}

        {file.kind === "VIDEO" && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <PlayIcon className="h-5 w-5 translate-x-px text-white" />
            </span>
          </span>
        )}
        {file.durationMs != null && (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
            {formatDuration(file.durationMs)}
          </span>
        )}
        {selecting && (
          <span className="pointer-events-none absolute left-1.5 top-1.5">
            <SelectionDot selected={selected} />
          </span>
        )}
      </button>
      {!selecting && <MenuButton label={file.name} onClick={onMenu} />}
    </div>
  );
}

export function FileRow({
  file,
  selecting,
  selected,
  onOpen,
  onToggle,
  onMenu,
}: {
  file: FileDTO;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onMenu: () => void;
}) {
  const { formatDate, locale } = useI18n();
  const press = useLongPress(onToggle);

  return (
    <li
      className={`flex items-center gap-3 px-3 py-2.5 transition ${
        selected ? "bg-amber-400/10" : ""
      }`}
    >
      <button
        type="button"
        {...press}
        onClick={() => (selecting ? onToggle() : onOpen())}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {selecting ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <SelectionDot selected={selected} />
          </span>
        ) : file.hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic media route
          <img
            src={thumbUrl(file)}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
            <KindIcon
              kind={file.kind}
              name={file.name}
              className={`h-5 w-5 ${kindTint(file.kind, file.mimeType, file.name)}`}
            />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-zinc-100">
            {file.name}
          </span>
          <span className="block truncate text-xs text-zinc-500">
            {formatSize(file.size)}
            {file.durationMs != null && ` · ${formatDuration(file.durationMs)}`}
            {" · "}
            {file.uploadedByName} ·{" "}
            {formatDate(new Date(file.createdAt), locale)}
          </span>
        </span>
      </button>
      {!selecting && (
        <MenuButton label={file.name} onClick={onMenu} inline />
      )}
    </li>
  );
}

function MenuButton({
  label,
  onClick,
  inline = false,
}: {
  label: string;
  onClick: () => void;
  inline?: boolean;
}) {
  const { t, fmt } = useI18n();
  return (
    <button
      type="button"
      aria-label={fmt(t.files.actionsFor, { name: label })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={
        inline
          ? "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
          : "absolute right-1 top-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/50 text-zinc-200 opacity-0 backdrop-blur-sm transition hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
      }
    >
      <MoreVerticalIcon className="h-4 w-4" />
    </button>
  );
}
