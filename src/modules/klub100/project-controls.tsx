"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { btnDangerOutline, btnPrimary, errorText, input } from "@/components/ui";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { createProject, deleteProject } from "./actions";

export function NewProjectForm() {
  const { t } = useI18n();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          const result = await createProject(formData);
          setError(result?.error);
          if (result?.ok) formRef.current?.reset();
        })
      }
      className="flex flex-wrap items-center gap-3"
    >
      <input
        type="text"
        name="name"
        required
        maxLength={80}
        placeholder={t.klub100.newMixPlaceholder}
        className={`${input} mt-0 min-w-0 flex-1 sm:max-w-xs`}
      />
      <button type="submit" disabled={isPending} className={btnPrimary}>
        <PlusIcon className="h-4 w-4" />
        {isPending ? t.klub100.creating : t.klub100.createProject}
      </button>
      {error && (
        <p className={`${errorText} w-full`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(t.klub100.confirmDeleteProject)) return;
        startTransition(async () => {
          const result = await deleteProject(projectId);
          if (result?.ok) router.push("/klub100");
        });
      }}
      className={btnDangerOutline}
    >
      <TrashIcon className="h-4 w-4" />
      {isPending ? t.klub100.deleting : t.klub100.deleteProject}
    </button>
  );
}
