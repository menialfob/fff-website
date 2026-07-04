import { generateHTML } from "@tiptap/html";
import { eventContentExtensions } from "./extensions";

/**
 * Server-side rendering of an event's TipTap document to HTML. The output
 * is limited to the whitelisted schema in extensions.ts. Returns null for
 * empty or unparseable content.
 */
export function renderEventContent(contentJson: string | null): string | null {
  if (!contentJson) return null;
  try {
    const doc = JSON.parse(contentJson);
    if (!doc || typeof doc !== "object" || doc.type !== "doc") return null;
    const html = generateHTML(doc, eventContentExtensions);
    return html && html !== "<p></p>" ? html : null;
  } catch {
    return null;
  }
}
