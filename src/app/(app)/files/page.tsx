import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { cardPad, emptyBox, listCard, PageTitle } from "@/components/ui";
import { DeleteFileButton, UploadForm } from "@/modules/files/file-controls";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function FilesPage() {
  const session = await requireSession();
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const files = await prisma.fileItem.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return (
    <div>
      <PageTitle>{t.modules.files.label}</PageTitle>
      <section className={`${cardPad} mb-8`}>
        <h2 className="mb-3 text-lg font-semibold text-white">
          {t.files.uploadTitle}
        </h2>
        <UploadForm />
      </section>
      {files.length === 0 ? (
        <p className={emptyBox}>{t.files.empty}</p>
      ) : (
        <ul className={listCard}>
          {files.map((file) => {
            const canDelete =
              file.uploadedById === session.user.id ||
              session.user.role === "ADMIN";
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
      )}
    </div>
  );
}
