"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/**
 * Action menu for a message, opened by long-press (touch) or the hover kebab
 * (desktop). Rendered as a bottom sheet on small screens and a centered card
 * on larger ones; delete is two-step so a slip of the thumb can't destroy a
 * message.
 */
export function MessageMenu({
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  onClose,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Lifting the finger after the long-press that opened this menu generates a
  // click on the overlay — ignore overlay clicks for a beat so the menu
  // doesn't close itself the instant it opens.
  const openedAt = useRef(Date.now());

  const item =
    "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-zinc-100 transition hover:bg-white/[0.06] active:bg-white/[0.08]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center"
      onClick={() => {
        if (Date.now() - openedAt.current > 400) onClose();
      }}
    >
      <div
        role="menu"
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl border border-white/10 bg-panel p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:max-w-xs md:rounded-2xl"
      >
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() => {
            onReply();
            onClose();
          }}
        >
          <span aria-hidden>↩️</span> {t.chat.reply}
        </button>
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() => {
            onCopy();
            onClose();
          }}
        >
          <span aria-hidden>📋</span> {t.chat.copy}
        </button>
        {canEdit && (
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              onEdit();
              onClose();
            }}
          >
            <span aria-hidden>✏️</span> {t.chat.edit}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            role="menuitem"
            className={`${item} text-red-400`}
            onClick={() => {
              if (!confirmingDelete) {
                setConfirmingDelete(true);
                return;
              }
              onDelete();
              onClose();
            }}
          >
            <span aria-hidden>🗑️</span>{" "}
            {confirmingDelete ? t.chat.deleteConfirm : t.chat.delete}
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className={`${item} justify-center text-zinc-400`}
          onClick={onClose}
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}
