"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { Sheet, ConfirmSheet } from "@/components/sheet";
import {
  btnPrimary,
  btnSecondary,
  emptyBox,
  errorText,
  input,
} from "@/components/ui";
import {
  CameraIcon,
  DownloadIcon,
  FolderPlusIcon,
  GridIcon,
  ListIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";
import { SaveButton, Spinner } from "@/components/save-button";
import { MAX_SAVE_BYTES, SaveTooLargeError, saveBlob } from "@/lib/download";
import { formatSize } from "@/lib/format";
import { Breadcrumbs } from "./breadcrumbs";
import { FileRow, FileTile, FolderRow, FolderTile } from "./items";
import { MoveSheet } from "./move-sheet";
import { UploadSheet } from "./upload-sheet";
import { Viewer } from "./viewer/viewer";
import {
  createFolder,
  deleteFiles,
  deleteFolder,
  moveFiles,
  moveFolder,
  renameFile,
  renameFolder,
} from "./actions";
import type { Crumb, FileDTO, FolderDTO, Viewer as ViewerUser } from "./types";
import { downloadUrl } from "./types";

type SortKey = "name" | "date" | "size";
type ViewMode = "grid" | "list";

const VIEW_STORAGE_KEY = "fff.files.view";

/**
 * The files section. One client component owns the whole surface — browsing,
 * selection, and every sheet — because they all read and write the same two
 * pieces of state (what is selected and what is open), and splitting them
 * would mean lifting that state somewhere else anyway.
 *
 * The server pages stay thin: they resolve the folder and hand over DTOs.
 */
export function FileBrowser({
  folder,
  trail,
  folders,
  files,
  attachedFolders,
  allFolders,
  viewer,
  source,
}: {
  /** The folder being viewed, or null at the root of the tree. */
  folder: FolderDTO | null;
  trail: Crumb[];
  folders: FolderDTO[];
  files: FileDTO[];
  /** Calendar/forum folders, listed apart. Root view only. */
  attachedFolders?: FolderDTO[];
  /** Every USER folder, for the move picker. */
  allFolders: FolderDTO[];
  viewer: ViewerUser;
  /** Where an ATTACHMENT folder came from, so we can link back to it. */
  source?: { label: string; href: string } | null;
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortKey>("date");
  const [ascending, setAscending] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renaming, setRenaming] = useState<
    { kind: "file" | "folder"; id: string; name: string } | null
  >(null);
  const [moving, setMoving] = useState<
    { kind: "files"; ids: string[] } | { kind: "folder"; id: string } | null
  >(null);
  const [confirming, setConfirming] = useState<
    { kind: "files"; ids: string[]; name?: string } | { kind: "folder"; id: string; name: string } | null
  >(null);
  const [menuFor, setMenuFor] = useState<
    { kind: "file"; file: FileDTO } | { kind: "folder"; folder: FolderDTO } | null
  >(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const locked = folder?.kind === "ATTACHMENT";

  // Remember grid-vs-list across visits; it is a per-person preference, not
  // something worth a round trip to the server.
  useEffect(() => {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "grid" || stored === "list") setView(stored);
  }, []);
  const changeView = (next: ViewMode) => {
    setView(next);
    localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const compare = useCallback(
    (a: FileDTO, b: FileDTO) => {
      const direction = ascending ? 1 : -1;
      if (sort === "name") return a.name.localeCompare(b.name) * direction;
      if (sort === "size") return (a.size - b.size) * direction;
      return (
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
        direction
      );
    },
    [sort, ascending],
  );

  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? files.filter((f) => f.name.toLowerCase().includes(needle))
      : files;
    return [...filtered].sort(compare);
  }, [files, query, compare]);

  const visibleFolders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? folders.filter((f) => f.name.toLowerCase().includes(needle))
      : folders;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, query]);

  const selecting = selection.size > 0;

  const toggle = useCallback((id: string) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  /** Runs an action, surfacing its error or message in the page banner. */
  const run = useCallback(
    (
      action: () => Promise<{ error?: string; message?: string } | void>,
      after?: () => void,
    ) => {
      setError(undefined);
      setNotice(undefined);
      startTransition(async () => {
        const result = await action();
        if (result?.error) {
          setError(result.error);
          return;
        }
        if (result?.message) setNotice(result.message);
        after?.();
        router.refresh();
      });
    },
    [router],
  );

  const empty = visibleFolders.length === 0 && visibleFiles.length === 0;

  return (
    <div className="pb-24">
      {trail.length > 0 && <Breadcrumbs trail={trail} />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {folder ? folder.name : t.files.root}
        </h1>

        {searching ? (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.files.searchPlaceholder}
              className={`${input} mt-0 sm:w-64`}
            />
            <button
              type="button"
              aria-label={t.files.clearSearch}
              onClick={() => {
                setQuery("");
                setSearching(false);
              }}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              label={t.files.searchPlaceholder}
              onClick={() => setSearching(true)}
            >
              <SearchIcon className="h-5 w-5" />
            </IconButton>
            <IconButton label={t.files.sortBy} onClick={() => setSortOpen(true)}>
              <SortIcon className="h-5 w-5" />
            </IconButton>
            <IconButton
              label={view === "grid" ? t.files.viewList : t.files.viewGrid}
              onClick={() => changeView(view === "grid" ? "list" : "grid")}
            >
              {view === "grid" ? (
                <ListIcon className="h-5 w-5" />
              ) : (
                <GridIcon className="h-5 w-5" />
              )}
            </IconButton>
          </div>
        )}
      </div>

      {source && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
          <span>{fmt(t.files.attachedBanner, { name: source.label })}</span>
          <a
            href={source.href}
            className="font-medium text-sky-300 hover:underline"
          >
            {t.files.goToSource}
          </a>
        </div>
      )}

      {error && (
        <p className={`${errorText} mb-3`} role="alert">
          {error}
        </p>
      )}
      {notice && <p className="mb-3 text-sm text-amber-300">{notice}</p>}

      {empty ? (
        <p className={emptyBox}>
          {query.trim()
            ? fmt(t.files.noMatches, { query: query.trim() })
            : folder
              ? t.files.emptyFolder
              : t.files.empty}
        </p>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
          {visibleFolders.map((f) => (
            <li key={f.id}>
              <FolderTile
                folder={f}
                onMenu={
                  locked ? undefined : () => setMenuFor({ kind: "folder", folder: f })
                }
              />
            </li>
          ))}
          {visibleFiles.map((file, i) => (
            <li key={file.id}>
              <FileTile
                file={file}
                selecting={selecting}
                selected={selection.has(file.id)}
                onOpen={() => setViewerIndex(i)}
                onToggle={() => toggle(file.id)}
                onMenu={() => setMenuFor({ kind: "file", file })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          {visibleFolders.map((f) => (
            <FolderRow
              key={f.id}
              folder={f}
              onMenu={
                locked ? undefined : () => setMenuFor({ kind: "folder", folder: f })
              }
            />
          ))}
          {visibleFiles.map((file, i) => (
            <FileRow
              key={file.id}
              file={file}
              selecting={selecting}
              selected={selection.has(file.id)}
              onOpen={() => setViewerIndex(i)}
              onToggle={() => toggle(file.id)}
              onMenu={() => setMenuFor({ kind: "file", file })}
            />
          ))}
        </ul>
      )}

      {attachedFolders && attachedFolders.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-white">
            {t.files.attachedFolders}
          </h2>
          <p className="mb-3 mt-1 max-w-2xl text-sm text-zinc-500">
            {t.files.attachedFoldersHint}
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
            {attachedFolders.map((f) => (
              <li key={f.id}>
                <FolderTile folder={f} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- floating add button --- */}
      {!locked && !selecting && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label={t.files.add}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950 shadow-xl shadow-orange-500/30 transition active:scale-95 md:bottom-8"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      )}

      {/* Selection action bar. Must outrank the mobile tab bar (z-40), which
          renders after this in the DOM and would otherwise cover these
          controls and swallow every tap. Sheets portal to <body> and so still
          land above it. Covering the tab bar during a selection is also what
          people expect. */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-panel pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-5xl items-center gap-1 px-3">
            <button
              type="button"
              onClick={clearSelection}
              aria-label={t.files.clearSelection}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/10"
            >
              <XIcon className="h-5 w-5" />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
              {fmt(t.files.selectedCount, { count: selection.size })}
            </span>
            <ZipButton
              ids={[...selection]}
              label={t.files.downloadZip}
              onError={setError}
            />
            <IconButton
              label={t.files.move}
              onClick={() => setMoving({ kind: "files", ids: [...selection] })}
            >
              <MoveIcon className="h-5 w-5" />
            </IconButton>
            <IconButton
              label={t.common.delete}
              danger
              onClick={() => setConfirming({ kind: "files", ids: [...selection] })}
            >
              <TrashIcon className="h-5 w-5" />
            </IconButton>
          </div>
        </div>
      )}

      {/* --- sheets --- */}

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t.files.add}
        footer={
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            className={`${btnSecondary} w-full`}
          >
            {t.common.cancel}
          </button>
        }
      >
        <ul className="space-y-1 pb-1">
          <SheetAction
            icon={<UploadIcon className="h-5 w-5" />}
            label={t.files.upload}
            onClick={() => {
              setAddOpen(false);
              setUploadOpen(true);
            }}
          />
          <SheetAction
            icon={<CameraIcon className="h-5 w-5" />}
            label={t.files.takePhoto}
            onClick={() => {
              setAddOpen(false);
              setCameraOpen(true);
            }}
          />
          <SheetAction
            icon={<FolderPlusIcon className="h-5 w-5" />}
            label={t.files.newFolder}
            onClick={() => {
              setAddOpen(false);
              setNewFolderOpen(true);
            }}
          />
        </ul>
      </Sheet>

      <UploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        folderId={folder?.id ?? null}
      />
      <UploadSheet
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        folderId={folder?.id ?? null}
        capture
      />

      <NameSheet
        open={newFolderOpen}
        title={t.files.newFolder}
        placeholder={t.files.folderNamePlaceholder}
        confirmLabel={t.common.create}
        maxLength={100}
        onClose={() => setNewFolderOpen(false)}
        onSubmit={(name) => {
          const data = new FormData();
          data.set("name", name);
          if (folder) data.set("parentId", folder.id);
          return createFolder(data);
        }}
      />

      <NameSheet
        open={renaming !== null}
        title={
          renaming?.kind === "folder"
            ? t.files.renameFolderTitle
            : t.files.renameFileTitle
        }
        placeholder={
          renaming?.kind === "folder"
            ? t.files.folderNamePlaceholder
            : t.files.fileNamePlaceholder
        }
        confirmLabel={t.common.save}
        defaultValue={renaming?.name}
        maxLength={renaming?.kind === "folder" ? 100 : 200}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => {
          if (!renaming) return Promise.resolve({});
          const data = new FormData();
          data.set("name", name);
          return renaming.kind === "folder"
            ? renameFolder(renaming.id, data)
            : renameFile(renaming.id, data);
        }}
      />

      <MoveSheet
        open={moving !== null}
        onClose={() => setMoving(null)}
        folders={allFolders}
        excludeIds={
          moving?.kind === "folder"
            ? subtreeOf(moving.id, allFolders)
            : []
        }
        onMove={async (destination) => {
          if (!moving) return;
          const result =
            moving.kind === "folder"
              ? await moveFolder(moving.id, destination)
              : await moveFiles(moving.ids, destination);
          if (!result?.error) clearSelection();
          return result;
        }}
      />

      <ConfirmSheet
        open={confirming !== null}
        pending={isPending}
        title={
          confirming?.kind === "folder"
            ? t.files.confirmDeleteFolderTitle
            : confirming && confirming.ids.length > 1
              ? fmt(t.files.confirmDeleteManyTitle, {
                  count: confirming.ids.length,
                })
              : t.files.confirmDeleteTitle
        }
        body={
          confirming?.kind === "folder"
            ? fmt(t.files.confirmDeleteFolder, { name: confirming.name })
            : confirming && confirming.ids.length > 1
              ? t.files.confirmDeleteMany
              : fmt(t.files.confirmDelete, { name: confirming?.name ?? "" })
        }
        confirmLabel={t.common.delete}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return;
          const target = confirming;
          run(
            () =>
              target.kind === "folder"
                ? deleteFolder(target.id)
                : deleteFiles(target.ids),
            () => {
              setConfirming(null);
              clearSelection();
            },
          );
        }}
      />

      <ItemMenu
        target={menuFor}
        viewer={viewer}
        onClose={() => setMenuFor(null)}
        onOpenFile={(file) => {
          const index = visibleFiles.findIndex((f) => f.id === file.id);
          if (index >= 0) setViewerIndex(index);
        }}
        onRename={(kind, id, name) => setRenaming({ kind, id, name })}
        onMove={(target) => setMoving(target)}
        onDelete={(target) => setConfirming(target)}
      />

      {viewerIndex !== null && visibleFiles.length > 0 && (
        <Viewer
          files={visibleFiles}
          initialIndex={Math.min(viewerIndex, visibleFiles.length - 1)}
          onClose={() => setViewerIndex(null)}
        />
      )}

      <SortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        sort={sort}
        ascending={ascending}
        onChange={(nextSort, nextAscending) => {
          setSort(nextSort);
          setAscending(nextAscending);
        }}
      />

      {/* Selection can outlive a refresh that deleted its files; drop ids that
          are no longer on the page so the action bar cannot act on ghosts. */}
      <SelectionSync
        ids={visibleFiles.map((f) => f.id)}
        selection={selection}
        onPrune={setSelection}
      />
    </div>
  );
}

/* --- small pieces ----------------------------------------------------------- */
/**
 * A folder plus every folder beneath it. A folder cannot be moved into its own
 * subtree — the server refuses it, and the picker should not offer a
 * destination that is going to fail.
 */
function subtreeOf(rootId: string, folders: FolderDTO[]): string[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const folder of folders) {
      if (folder.parentId === ids[i] && !ids.includes(folder.id)) {
        ids.push(folder.id);
      }
    }
  }
  return ids;
}


function IconButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/10 ${
        danger ? "text-red-300 hover:text-red-200" : "text-zinc-400 hover:text-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

function SheetAction({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/5 ${
          danger ? "text-red-300" : "text-zinc-100"
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </button>
    </li>
  );
}

/**
 * Bulk download. Fetched rather than submitted as a form: a form post is a
 * top-level navigation, which inside the installed app strands the member on
 * iOS's document preview with no way back (see src/lib/download.ts). POST
 * keeps the id list off the URL, where it would hit length limits.
 */
function ZipButton({
  ids,
  label,
  onError,
}: {
  ids: string[];
  label: string;
  onError: (message: string) => void;
}) {
  const { t, fmt } = useI18n();
  const [saving, setSaving] = useState(false);

  const download = async () => {
    setSaving(true);
    try {
      const body = new FormData();
      for (const id of ids) body.append("id", id);
      const response = await fetch("/api/files/zip", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!response.ok) {
        const reason = await response.json().catch(() => null);
        throw new Error(reason?.error ?? String(response.status));
      }
      const stamp = new Date().toISOString().slice(0, 10);
      await saveBlob(await response.blob(), `fff-filer-${stamp}.zip`);
    } catch (err) {
      onError(
        err instanceof SaveTooLargeError || (err as Error).message === "too-large"
          ? fmt(t.errors.zipTooLarge, { size: formatSize(MAX_SAVE_BYTES) })
          : t.errors.saveFailed,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      disabled={saving}
      onClick={download}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50"
    >
      {saving ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
    </button>
  );
}

function NameSheet({
  open,
  title,
  placeholder,
  confirmLabel,
  defaultValue,
  maxLength,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  confirmLabel: string;
  defaultValue?: string;
  maxLength: number;
  onClose: () => void;
  onSubmit: (name: string) => Promise<{ error?: string } | void>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState(defaultValue ?? "");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setValue(defaultValue ?? "");
      setError(undefined);
    }
  }, [open, defaultValue]);

  const submit = () => {
    if (!value.trim()) return;
    startTransition(async () => {
      const result = await onSubmit(value.trim());
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            disabled={isPending || !value.trim()}
            onClick={submit}
            className={btnPrimary}
          >
            {isPending ? t.common.saving : confirmLabel}
          </button>
        </div>
      }
    >
      <input
        type="text"
        value={value}
        autoFocus
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className={`${input} mt-0`}
      />
      {error && (
        <p className={`${errorText} mt-2`} role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function SortSheet({
  open,
  onClose,
  sort,
  ascending,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  sort: SortKey;
  ascending: boolean;
  onChange: (sort: SortKey, ascending: boolean) => void;
}) {
  const { t } = useI18n();
  const options: { key: SortKey; label: string }[] = [
    { key: "name", label: t.files.sortName },
    { key: "date", label: t.files.sortDate },
    { key: "size", label: t.files.sortSize },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.files.sortBy}
      footer={
        <button
          type="button"
          onClick={onClose}
          className={`${btnSecondary} w-full`}
        >
          {t.common.close}
        </button>
      }
    >
      <ul className="space-y-1 pb-1">
        {options.map((option) => (
          <li key={option.key}>
            <button
              type="button"
              onClick={() =>
                // Tapping the active key flips direction, the way a table
                // header does; tapping a different key starts fresh.
                onChange(
                  option.key,
                  sort === option.key ? !ascending : option.key === "name",
                )
              }
              className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition hover:bg-white/5 ${
                sort === option.key ? "text-amber-300" : "text-zinc-200"
              }`}
            >
              <span className="font-medium">{option.label}</span>
              {sort === option.key && (
                <span className="text-xs text-zinc-500">
                  {ascending ? t.files.sortAscending : t.files.sortDescending}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function ItemMenu({
  target,
  viewer,
  onClose,
  onOpenFile,
  onRename,
  onMove,
  onDelete,
}: {
  target:
    | { kind: "file"; file: FileDTO }
    | { kind: "folder"; folder: FolderDTO }
    | null;
  viewer: ViewerUser;
  onClose: () => void;
  onOpenFile: (file: FileDTO) => void;
  onRename: (kind: "file" | "folder", id: string, name: string) => void;
  onMove: (
    target: { kind: "files"; ids: string[] } | { kind: "folder"; id: string },
  ) => void;
  onDelete: (
    target:
      | { kind: "files"; ids: string[]; name?: string }
      | { kind: "folder"; id: string; name: string },
  ) => void;
}) {
  const { t } = useI18n();
  const isAdmin = viewer.role === "ADMIN";

  const name =
    target?.kind === "file" ? target.file.name : (target?.folder.name ?? "");
  // Deleting is the one thing not open to everyone: there is no undo.
  const canDelete =
    target?.kind === "file"
      ? isAdmin || target.file.uploadedById === viewer.id
      : isAdmin || target?.folder.createdById === viewer.id;

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={name}
      footer={
        <button type="button" onClick={onClose} className={`${btnSecondary} w-full`}>
          {t.common.cancel}
        </button>
      }
    >
      <ul className="space-y-1 pb-1">
        {target?.kind === "file" && (
          <>
            <SheetAction
              icon={<SearchIcon className="h-5 w-5" />}
              label={t.files.open}
              onClick={() => {
                onOpenFile(target.file);
                onClose();
              }}
            />
            <li>
              <SaveButton
                variant="button"
                url={downloadUrl(target.file.id)}
                name={target.file.name}
                mimeType={target.file.mimeType}
                size={target.file.size}
                onDone={onClose}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-zinc-100 transition hover:bg-white/5 disabled:opacity-50"
              />
            </li>
          </>
        )}
        <SheetAction
          icon={<PencilIcon className="h-5 w-5" />}
          label={t.files.rename}
          onClick={() => {
            if (!target) return;
            onRename(
              target.kind,
              target.kind === "file" ? target.file.id : target.folder.id,
              name,
            );
            onClose();
          }}
        />
        <SheetAction
          icon={<MoveIcon className="h-5 w-5" />}
          label={t.files.move}
          onClick={() => {
            if (!target) return;
            onMove(
              target.kind === "file"
                ? { kind: "files", ids: [target.file.id] }
                : { kind: "folder", id: target.folder.id },
            );
            onClose();
          }}
        />
        {canDelete && (
          <SheetAction
            danger
            icon={<TrashIcon className="h-5 w-5" />}
            label={target?.kind === "folder" ? t.files.deleteFolder : t.common.delete}
            onClick={() => {
              if (!target) return;
              onDelete(
                target.kind === "file"
                  ? { kind: "files", ids: [target.file.id], name: target.file.name }
                  : { kind: "folder", id: target.folder.id, name: target.folder.name },
              );
              onClose();
            }}
          />
        )}
      </ul>
    </Sheet>
  );
}

/** Drops selected ids that no longer exist after a refresh. */
function SelectionSync({
  ids,
  selection,
  onPrune,
}: {
  ids: string[];
  selection: Set<string>;
  onPrune: (next: Set<string>) => void;
}) {
  useEffect(() => {
    if (selection.size === 0) return;
    const present = new Set(ids);
    const pruned = new Set([...selection].filter((id) => present.has(id)));
    if (pruned.size !== selection.size) onPrune(pruned);
  }, [ids, selection, onPrune]);
  return null;
}
