"use client";

import { useI18n } from "@/lib/i18n/client";
import { btnSecondary } from "@/components/ui";
import { DownloadIcon } from "@/components/icons";
import { Spinner } from "@/components/save-button";
import { MAX_SAVE_BYTES, saveUrl, useSave } from "@/lib/download";
import { formatSize } from "@/lib/format";

/**
 * Downloads a project's export archive. A button rather than a link because a
 * link navigates the window, which inside the installed app leaves the member
 * on iOS's document preview with no way back (see src/lib/download.ts).
 */
export function ExportButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { t, fmt } = useI18n();
  const { save, saving, error } = useSave({
    tooLarge: fmt(t.errors.saveTooLarge, { size: formatSize(MAX_SAVE_BYTES) }),
    failed: t.errors.saveFailed,
  });

  const slug =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "klub100";

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={saving}
        onClick={() =>
          save(() =>
            saveUrl(`/api/klub100/export/${projectId}`, `klub100-${slug}.zip`, {
              mimeType: "application/zip",
            }),
          )
        }
        className={btnSecondary}
      >
        {saving ? <Spinner /> : <DownloadIcon className="h-4 w-4" />}
        {saving ? t.common.saving : t.klub100.exportPackage}
      </button>
      {error && (
        <span className="text-xs text-red-300" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
