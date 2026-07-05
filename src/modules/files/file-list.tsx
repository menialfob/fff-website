import { formatSize } from "@/lib/format";
import { formatDate, type Locale } from "@/lib/i18n";
import { listCard } from "@/components/ui";
import { DeleteFileButton } from "@/modules/files/file-controls";

type FileRow = {
  id: string;
  name: string;
  size: number;
  createdAt: Date;
  uploadedById: string;
  uploadedBy: { name: string };
};

// Shared file listing used by the files root page and folder pages.
export function FileList({
  files,
  viewer,
  locale,
}: {
  files: FileRow[];
  viewer: { id: string; role: string };
  locale: Locale;
}) {
  return (
    <ul className={listCard}>
      {files.map((file) => {
        const canDelete =
          file.uploadedById === viewer.id || viewer.role === "ADMIN";
        return (
          <li
            key={file.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-6"
          >
            <a
              href={`/api/files/${file.id}`}
              className="font-medium text-zinc-100 hover:text-sky-300 hover:underline"
            >
              {file.name}
            </a>
            <span className="text-sm text-zinc-500">
              {formatSize(file.size)} · {file.uploadedBy.name} ·{" "}
              {formatDate(file.createdAt, locale)}
            </span>
            <span className="flex-1" />
            {canDelete && <DeleteFileButton fileId={file.id} />}
          </li>
        );
      })}
    </ul>
  );
}
