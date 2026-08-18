"use client";

import { useEffect, useState } from "react";
import type { Tokens, TokensList, Token } from "marked";
import { useI18n } from "@/lib/i18n/client";
import { Spinner } from "@/components/save-button";
import { isMarkdown } from "../kind";
import type { FileDTO } from "../types";
import { fileUrl } from "../types";
import { DocCard } from "./panes";

/**
 * Text and Markdown, read in place instead of downloaded — a meeting note
 * should be readable on a phone without a round trip through the Files app.
 *
 * Markdown is lexed with `marked` and rendered as React elements rather than
 * through an HTML string. That is the whole security story: an uploaded .md
 * cannot introduce markup, because no markup from it is ever parsed as HTML.
 * Links are limited to the schemes a document has any business using.
 */

/** Past this the file stops being something you read on a phone. */
const MAX_TEXT_BYTES = 1024 * 1024;
const SAFE_SCHEMES = ["http:", "https:", "mailto:"];

export function TextPane({ file }: { file: FileDTO }) {
  const { t } = useI18n();
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(undefined);
    setFailed(false);
    fetch(fileUrl(file.id), { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((body) => !cancelled && setText(body))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  // Anything too big to read comfortably, or that would not load, falls back
  // to the ordinary document card rather than showing a broken pane.
  if (file.size > MAX_TEXT_BYTES || failed) return <DocCard file={file} />;

  if (text === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-zinc-500">
        <Spinner className="h-5 w-5" />
        {t.common.loading}
      </div>
    );
  }

  return (
    // Positioned rather than sized with a percentage: the parent centres its
    // children, and a percentage height against a flex item whose cross size
    // comes from alignment is not something every engine resolves the same
    // way. inset-0 is unambiguous everywhere.
    <div
      className="absolute inset-0 overflow-y-auto overscroll-contain"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mx-auto max-w-2xl px-3 py-2">
        {isMarkdown(file.mimeType, file.name) ? (
          <Markdown source={text} />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-zinc-200">
            {text}
          </pre>
        )}
      </div>
    </div>
  );
}

function Markdown({ source }: { source: string }) {
  const [tokens, setTokens] = useState<TokensList>();

  // Loaded on demand: the parser is only needed once someone opens a document.
  useEffect(() => {
    let cancelled = false;
    import("marked")
      .then(({ marked }) => !cancelled && setTokens(marked.lexer(source)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (!tokens) {
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-zinc-200">
        {source}
      </pre>
    );
  }
  // .event-content already styles rendered rich text for this theme — the
  // calendar and forum use the same rules, so documents match the rest of
  // the site for free.
  return <div className="event-content">{renderBlocks(tokens)}</div>;
}

/* --- token → element ------------------------------------------------------- */

function renderBlocks(tokens: Token[]): React.ReactNode[] {
  return tokens.map((token, i) => <Block key={i} token={token} />);
}

function Block({ token }: { token: Token }): React.ReactElement | null {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      const Tag = (["h1", "h2", "h3", "h4", "h5", "h6"] as const)[
        Math.min(5, Math.max(0, t.depth - 1))
      ];
      return <Tag>{renderInline(t.tokens)}</Tag>;
    }
    case "paragraph":
      return <p>{renderInline((token as Tokens.Paragraph).tokens)}</p>;
    case "text": {
      const t = token as Tokens.Text;
      return <p>{t.tokens ? renderInline(t.tokens) : t.text}</p>;
    }
    case "list": {
      const t = token as Tokens.List;
      const items = t.items.map((item, i) => (
        // A checkbox replaces the bullet on a task item, and pulls back the
        // list indent so it lines up with the text around it.
        <li key={i} className={item.task ? "-ml-5 list-none" : undefined}>
          <ListItem item={item} />
        </li>
      ));
      return t.ordered ? (
        <ol start={typeof t.start === "number" ? t.start : undefined}>{items}</ol>
      ) : (
        <ul>{items}</ul>
      );
    }
    case "blockquote":
      return <blockquote>{renderBlocks((token as Tokens.Blockquote).tokens)}</blockquote>;
    case "code":
      return (
        <pre>
          <code>{(token as Tokens.Code).text}</code>
        </pre>
      );
    case "table": {
      const t = token as Tokens.Table;
      return (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {t.header.map((cell, i) => (
                  <th key={i} style={{ textAlign: t.align[i] ?? undefined }}>
                    {renderInline(cell.tokens)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={{ textAlign: t.align[c] ?? undefined }}>
                      {renderInline(cell.tokens)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "hr":
      return <hr />;
    case "space":
      return null;
    default:
      // Raw HTML and anything unrecognised is shown as its own source text,
      // never parsed — that is what keeps an uploaded document inert.
      return <p>{(token as Tokens.Generic).raw}</p>;
  }
}

/**
 * A list item's contents. Tight items keep their text inline — wrapping every
 * one in a paragraph is what makes a short checklist sprawl down the screen —
 * while loose items keep the paragraphs the author asked for.
 */
function ListItem({ item }: { item: Tokens.ListItem }) {
  return (
    <>
      {item.tokens.map((token, i) => {
        if (token.type === "checkbox") {
          return (
            <input
              key={i}
              type="checkbox"
              checked={Boolean(item.checked)}
              readOnly
              aria-hidden
              className="mr-2 align-middle accent-amber-400"
            />
          );
        }
        if (!item.loose && token.type === "text") {
          const t = token as Tokens.Text;
          return (
            <span key={i}>{t.tokens ? renderInline(t.tokens) : t.text}</span>
          );
        }
        return <Block key={i} token={token} />;
      })}
    </>
  );
}

function renderInline(tokens: Token[] | undefined): React.ReactNode[] {
  if (!tokens) return [];
  return tokens.map((token, i) => {
    switch (token.type) {
      case "strong":
        return <strong key={i}>{renderInline((token as Tokens.Strong).tokens)}</strong>;
      case "em":
        return <em key={i}>{renderInline((token as Tokens.Em).tokens)}</em>;
      case "del":
        return <del key={i}>{renderInline((token as Tokens.Del).tokens)}</del>;
      case "codespan":
        return <code key={i}>{(token as Tokens.Codespan).text}</code>;
      case "br":
        return <br key={i} />;
      case "link": {
        const t = token as Tokens.Link;
        const href = safeHref(t.href);
        return href ? (
          <a key={i} href={href} target="_blank" rel="noreferrer noopener">
            {renderInline(t.tokens)}
          </a>
        ) : (
          <span key={i}>{renderInline(t.tokens)}</span>
        );
      }
      case "image": {
        const t = token as Tokens.Image;
        const href = safeHref(t.href);
        if (!href) return <span key={i}>{t.text}</span>;
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary URL from a member's document
        return <img key={i} src={href} alt={t.text} loading="lazy" />;
      }
      case "text":
      case "escape":
        return <span key={i}>{(token as Tokens.Text).text}</span>;
      default:
        return <span key={i}>{(token as Tokens.Generic).raw}</span>;
    }
  });
}

/** Only schemes a document has a legitimate reason to link to. */
function safeHref(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin);
    return SAFE_SCHEMES.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
