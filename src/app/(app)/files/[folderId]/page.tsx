import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FileBrowser } from "@/modules/files/browser";
import {
  folderSelect,
  listAllUserFolders,
  listFolder,
  sourceOf,
  toFolderDTO,
  trailTo,
} from "@/modules/files/data";
import { MarkFolderSeen } from "@/modules/files/mark-folder-seen";
import { folderUnreadCounts, withUnread } from "@/modules/files/unread";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const session = await requireSession();
  const { folderId } = await params;

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: folderSelect,
  });
  if (!folder) notFound();

  const [{ folders, files }, trail, allFolders, source, unread] =
    await Promise.all([
      listFolder(folder.id),
      // Attachment folders live outside the tree, so they get no trail.
      folder.kind === "ATTACHMENT" ? Promise.resolve([]) : trailTo(folder.id),
      listAllUserFolders(),
      folder.kind === "ATTACHMENT" ? sourceOf(folder.id) : Promise.resolve(null),
      folderUnreadCounts(session.user.id),
    ]);

  return (
    <>
      {/* Opening the folder is what reads it: keyed by id so walking into a
          sibling starts a fresh visit rather than reusing this one. */}
      <MarkFolderSeen
        key={folder.id}
        folderId={folder.id}
        unread={unread.get(folder.id) ?? 0}
      />
      <FileBrowser
        folder={toFolderDTO(folder)}
        trail={trail}
        folders={withUnread(folders, unread)}
        files={files}
        allFolders={allFolders}
        viewer={{ id: session.user.id, role: session.user.role }}
        source={source}
      />
    </>
  );
}
