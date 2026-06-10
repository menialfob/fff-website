import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DeleteFileButton, UploadForm } from "@/modules/files/file-controls";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function FilesPage() {
  const session = await requireSession();
  const files = await prisma.fileItem.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Files</h1>
      <section className="mb-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Upload</h2>
        <UploadForm />
      </section>
      {files.length === 0 ? (
        <p className="text-stone-600">Nothing here yet — upload something!</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm">
          {files.map((file) => {
            const canDelete =
              file.uploadedById === session.user.id ||
              session.user.role === "ADMIN";
            return (
              <li
                key={file.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3"
              >
                <a
                  href={`/api/files/${file.id}`}
                  className="font-medium text-stone-900 hover:underline"
                >
                  {file.name}
                </a>
                <span className="text-sm text-stone-500">
                  {formatSize(file.size)} · {file.uploadedBy.name} ·{" "}
                  {file.createdAt.toLocaleDateString("en-GB")}
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
