"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject, deleteProject, setProjectFlag } from "./actions";

export function NewProjectForm() {
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
        placeholder="New mix — e.g. “Sommerfest 2026”"
        className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2.5 text-sm sm:max-w-xs"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create project"}
      </button>
      {error && (
        <p className="w-full text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function ProjectFlags({
  projectId,
  reordered,
  mixed,
}: {
  projectId: string;
  reordered: boolean;
  mixed: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const toggle = (flag: "reordered" | "mixed", value: boolean) =>
    startTransition(async () => {
      await setProjectFlag(projectId, flag, value);
    });

  const flagButton = (flag: "reordered" | "mixed", value: boolean, label: string) => (
    <button
      type="button"
      disabled={isPending}
      onClick={() => toggle(flag, !value)}
      className={`rounded-full border px-3 py-1.5 text-sm disabled:opacity-50 ${
        value
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-stone-300 text-stone-600 hover:bg-stone-100"
      }`}
    >
      {value ? "✓" : "○"} {label}
    </button>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {flagButton("reordered", reordered, "Reordered")}
      {flagButton("mixed", mixed, "Mixed")}
    </div>
  );
}

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this project, all suggestions and cheers recordings?"))
          return;
        startTransition(async () => {
          const result = await deleteProject(projectId);
          if (result?.ok) router.push("/klub100");
        });
      }}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      Delete project
    </button>
  );
}
