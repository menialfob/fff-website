import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { cardHover, cardPad, emptyBox, PageTitle } from "@/components/ui";
import { FolderIcon } from "@/components/icons";
import { CreateFolderForm, UploadForm } from "@/modules/files/file-controls";
import { FileList } from "@/modules/files/file-list";

export default async function FilesPage() {
  const session = await requireSession();
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { files: true } } },
    }),
    prisma.fileItem.findMany({
      where: { folderId: null },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { name: true } } },
    }),
  ]);

  return (
    <div>
      <PageTitle>{t.modules.files.label}</PageTitle>
      <section className={`${cardPad} mb-8`}>
        <h2 className="mb-3 text-lg font-semibold text-white">
          {t.files.uploadTitle}
        </h2>
        <UploadForm />
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">
            {t.files.folders}
          </h2>
          <CreateFolderForm />
        </div>
        {folders.length === 0 ? (
          <p className={emptyBox}>{t.files.noFolders}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder) => (
              <li key={folder.id}>
                <Link
                  href={`/files/${folder.id}`}
                  className={`${cardHover} flex items-center gap-3 p-4`}
                >
                  <FolderIcon className="h-6 w-6 shrink-0 text-sky-300" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-zinc-100">
                      {folder.name}
                    </span>
                    <span className="block text-sm text-zinc-500">
                      {folder._count.files === 1
                        ? t.files.fileCountOne
                        : fmt(t.files.fileCount, {
                            count: folder._count.files,
                          })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {files.length === 0 ? (
        <p className={emptyBox}>{t.files.empty}</p>
      ) : (
        <FileList
          files={files}
          viewer={{ id: session.user.id, role: session.user.role }}
          locale={locale}
        />
      )}
    </div>
  );
}
