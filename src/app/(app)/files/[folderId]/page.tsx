import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict, getLocale } from "@/lib/i18n/server";
import { cardPad, emptyBox, PageTitle } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { FolderControls, UploadForm } from "@/modules/files/file-controls";
import { FileList } from "@/modules/files/file-list";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const session = await requireSession();
  const { folderId } = await params;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      files: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
    },
  });
  if (!folder) notFound();

  const canManage =
    folder.createdById === session.user.id || session.user.role === "ADMIN";

  return (
    <div>
      <Link
        href="/files"
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t.modules.files.label}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{folder.name}</PageTitle>
        {canManage && (
          <FolderControls folderId={folder.id} name={folder.name} />
        )}
      </div>
      <section className={`${cardPad} mb-8`}>
        <h2 className="mb-3 text-lg font-semibold text-white">
          {t.files.uploadTitle}
        </h2>
        <UploadForm folderId={folder.id} />
      </section>
      {folder.files.length === 0 ? (
        <p className={emptyBox}>{t.files.emptyFolder}</p>
      ) : (
        <FileList
          files={folder.files}
          viewer={{ id: session.user.id, role: session.user.role }}
          locale={locale}
        />
      )}
    </div>
  );
}
