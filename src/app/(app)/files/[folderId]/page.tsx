import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FileBrowser } from "@/modules/files/browser";
import {
  listAllUserFolders,
  listFolder,
  sourceOf,
  toFolderDTO,
  trailTo,
} from "@/modules/files/data";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const session = await requireSession();
  const { folderId } = await params;

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: {
      id: true,
      name: true,
      kind: true,
      parentId: true,
      createdById: true,
      _count: { select: { files: true, children: true } },
    },
  });
  if (!folder) notFound();

  const [{ folders, files }, trail, allFolders, source] = await Promise.all([
    listFolder(folder.id),
    // Attachment folders live outside the tree, so they get no trail.
    folder.kind === "ATTACHMENT" ? Promise.resolve([]) : trailTo(folder.id),
    listAllUserFolders(),
    folder.kind === "ATTACHMENT" ? sourceOf(folder.id) : Promise.resolve(null),
  ]);

  return (
    <FileBrowser
      folder={toFolderDTO(folder)}
      trail={trail}
      folders={folders}
      files={files}
      allFolders={allFolders}
      viewer={{ id: session.user.id, role: session.user.role }}
      source={source}
    />
  );
}
