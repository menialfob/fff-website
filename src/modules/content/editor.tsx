"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useI18n } from "@/lib/i18n/client";
import { errorText } from "@/components/ui";
import { ImageIcon, LinkIcon } from "@/components/icons";
import { contentExtensions } from "./extensions";
import { uploadContentAsset } from "./actions";

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // preventDefault so the editor keeps focus/selection while tapping.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-semibold transition ${
        active
          ? "bg-white/15 text-white"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = prompt(t.content.editor.linkPrompt, previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImage = async (file: File) => {
    setError(undefined);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadContentAsset(formData);
      if (result.error) {
        setError(result.error);
      } else if (result.ok && result.url) {
        editor
          .chain()
          .focus()
          .setImage({ src: result.url, alt: result.name })
          .run();
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-2">
        <ToolbarButton
          label={t.content.editor.bold}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          label={t.content.editor.italic}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label={t.content.editor.heading}
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label={t.content.editor.subheading}
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          label={t.content.editor.bulletList}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          ••
        </ToolbarButton>
        <ToolbarButton
          label={t.content.editor.orderedList}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          label={t.content.editor.link}
          active={editor.isActive("link")}
          onClick={setLink}
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label={t.content.editor.image}
          disabled={uploading}
          onClick={() => imageInputRef.current?.click()}
        >
          {uploading ? "…" : <ImageIcon className="h-4 w-4" />}
        </ToolbarButton>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void insertImage(file);
          }}
        />
      </div>
      {error && (
        <p className={`${errorText} mt-2`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Rich content editor shared by calendar events and forum posts. Keeps the
 * serialized TipTap document in a hidden input named `contentJson`, so the
 * surrounding <form action={…}> picks it up like any other field.
 */
export function ContentEditor({
  initialContent,
}: {
  initialContent: string | null;
}) {
  const [contentJson, setContentJson] = useState(initialContent ?? "");

  const editor = useEditor({
    extensions: contentExtensions,
    content: initialContent ? JSON.parse(initialContent) : undefined,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "min-h-40 pt-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      setContentJson(JSON.stringify(editor.getJSON()));
    },
  });

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 pb-3 pt-2">
      <input type="hidden" name="contentJson" value={contentJson} />
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
