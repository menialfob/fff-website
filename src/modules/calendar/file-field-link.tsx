"use client";

import { formatSize } from "@/lib/format";
import { SaveButton } from "@/components/save-button";
import { downloadUrl } from "@/modules/files/types";

/**
 * A document attached to a calendar field. Rendered as a name plus a save
 * button rather than a link: linking straight at the file navigates the window,
 * which inside the installed app strands the member (see src/lib/download.ts).
 *
 * Its own component because the fields are rendered from a server component.
 */
export function FileFieldLink({
  id,
  name,
  size,
}: {
  id: string;
  name: string;
  size?: number;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 align-middle">
      <span className="truncate font-medium text-zinc-100">{name}</span>
      {size != null && (
        <span className="shrink-0 text-xs text-zinc-500">
          {formatSize(size)}
        </span>
      )}
      <SaveButton
        url={downloadUrl(id)}
        name={name}
        size={size}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50"
      />
    </span>
  );
}
