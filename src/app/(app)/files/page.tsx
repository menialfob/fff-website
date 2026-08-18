import { requireSession } from "@/lib/auth";
import { MarkSeen } from "@/components/mark-seen";
import { FileBrowser } from "@/modules/files/browser";
import {
  listAllUserFolders,
  listAttachedFolders,
  listFolder,
} from "@/modules/files/data";

export default async function FilesPage() {
  const session = await requireSession();
  const [{ folders, files }, attachedFolders, allFolders] = await Promise.all([
    listFolder(null),
    listAttachedFolders(),
    listAllUserFolders(),
  ]);

  return (
    <>
      <MarkSeen section="files" />
      <FileBrowser
        folder={null}
        trail={[]}
        folders={folders}
        files={files}
        attachedFolders={attachedFolders}
        allFolders={allFolders}
        viewer={{ id: session.user.id, role: session.user.role }}
      />
    </>
  );
}
