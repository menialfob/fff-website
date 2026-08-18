"use client";

import type { Dictionary } from "@/lib/i18n";
import {
  ArchiveIcon,
  FileTextIcon,
  FilmIcon,
  ImageIcon,
  MusicIcon,
} from "@/components/icons";
import { docFamily, type FileKind } from "./kind";
import type { FileDTO } from "./types";

/**
 * Icon and label for a file's type, shared by the grid tiles, the list rows
 * and the viewer's document card so a .xlsx looks the same everywhere.
 */

/** Office apps have colour conventions members already read at a glance. */
const FAMILY_TINT: Record<string, string> = {
  word: "text-blue-300",
  excel: "text-emerald-300",
  powerpoint: "text-orange-300",
  text: "text-zinc-300",
  other: "text-zinc-300",
};

export function kindTint(kind: FileKind, mimeType: string, name: string): string {
  switch (kind) {
    case "IMAGE":
      return "text-violet-300";
    case "VIDEO":
      return "text-fuchsia-300";
    case "AUDIO":
      return "text-cyan-300";
    case "PDF":
      return "text-red-300";
    case "DOC":
      return FAMILY_TINT[docFamily(mimeType, name)] ?? "text-zinc-300";
    default:
      return "text-zinc-400";
  }
}

export function KindIcon({
  kind,
  className = "h-6 w-6",
}: {
  kind: FileKind;
  /** Accepted so callers can pass a file straight through; the glyph is
   *  chosen by kind alone, with colour carrying the Office family. */
  name?: string;
  className?: string;
}) {
  switch (kind) {
    case "IMAGE":
      return <ImageIcon className={className} />;
    case "VIDEO":
      return <FilmIcon className={className} />;
    case "AUDIO":
      return <MusicIcon className={className} />;
    case "PDF":
    case "DOC":
      return <FileTextIcon className={className} />;
    default:
      return <ArchiveIcon className={className} />;
  }
}

/** Human name for the type — "Word document" beats "DOC" on a detail card. */
export function kindLabel(
  t: Dictionary,
  file: Pick<FileDTO, "kind" | "mimeType" | "name">,
): string {
  if (file.kind === "DOC") {
    switch (docFamily(file.mimeType, file.name)) {
      case "word":
        return t.files.kindWord;
      case "excel":
        return t.files.kindExcel;
      case "powerpoint":
        return t.files.kindPowerpoint;
      case "text":
        return t.files.kindText;
      default:
        return t.files.kindDOC;
    }
  }
  return t.files[`kind${file.kind}`];
}
