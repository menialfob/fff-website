import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";

/**
 * The one TipTap schema for rich content (calendar event descriptions, forum
 * posts, …), shared by the client editor and the server-side renderer. Because
 * generateHTML() can only emit nodes and marks defined here, the schema doubles
 * as the sanitizer — no raw HTML from users ever reaches the page.
 */
export const contentExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    codeBlock: false,
    code: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    protocols: ["http", "https", "mailto"],
    HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
  }),
  Image,
];
