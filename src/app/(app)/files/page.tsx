import { requireSession } from "@/lib/auth";
import { MarkSeen } from "@/components/mark-seen";
import { FileBrowser } from "@/modules/files/browser";
import {
  listAllUserFolders,
  listAttachedFolders,
  listFolder,
} from "@/modules/files/data";
import { folderUnreadCounts, withUnread } from "@/modules/files/unread";

export default async function FilesPage() {
  const session = await requireSession();
  const [{ folders, files }, attachedFolders, allFolders, unread] =
    await Promise.all([
      listFolder(null),
      listAttachedFolders(),
      listAllUserFolders(),
      folderUnreadCounts(session.user.id),
    ]);

  return (
    <>
      <MarkSeen section="files" />
      <FileBrowser
        folder={null}
        trail={[]}
        folders={withUnread(folders, unread)}
        files={files}
        attachedFolders={withUnread(attachedFolders, unread)}
        allFolders={allFolders}
        viewer={{ id: session.user.id, role: session.user.role }}
      />
    </>
  );
}
