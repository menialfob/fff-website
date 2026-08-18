"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/client";
import { btnDangerOutline, btnPrimary, btnSecondary } from "@/components/ui";

/**
 * The app's modal surface: a bottom sheet on phones, a centred dialog from
 * `sm` up. Phones are the primary target, so it behaves like a native sheet —
 * it slides up from the bottom edge, sits above the safe area, and can be
 * flicked down to dismiss.
 *
 * Handles the things every modal needs and none of the callers should repeat:
 * a portal out of the page's stacking context, a focus trap, Escape, a locked
 * background scroll, and a backdrop click.
 */

const DISMISS_PX = 90;

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned below the scrollable body — action buttons belong here. */
  footer?: React.ReactNode;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  // Escape closes; Tab cycles inside the panel so focus can never land on the
  // page behind the backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // Lock the page behind the sheet, restoring whatever overflow was set.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDrag(0);
      return;
    }
    panelRef.current?.focus();
  }, [open]);

  const endDrag = useCallback(() => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    setDrag((current) => {
      if (current > DISMISS_PX) onClose();
      return 0;
    });
  }, [onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <button
        type="button"
        aria-label={t.common.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        className={`relative flex max-h-[88vh] w-full flex-col rounded-t-3xl border border-white/10 bg-panel shadow-2xl shadow-black/60 outline-none transition-transform sm:max-w-lg sm:rounded-3xl ${
          drag > 0 ? "duration-0" : "duration-200"
        }`}
      >
        {/* Grab handle: the drag target on touch, decorative on desktop. */}
        <div
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            dragStart.current = e.clientY;
          }}
          onPointerMove={(e) => {
            if (dragStart.current === null) return;
            setDrag(Math.max(0, e.clientY - dragStart.current));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex shrink-0 touch-none justify-center pb-1 pt-3 sm:hidden"
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-white/25" />
        </div>

        {title && (
          <h2 className="shrink-0 px-5 pb-3 pt-3 text-lg font-semibold text-white sm:pt-5">
            {title}
          </h2>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
          {children}
        </div>

        <div className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Destructive confirmation. Replaces window.confirm(), which on a phone is an
 * unstyled system alert that says nothing about what is about to happen.
 */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  destructive = true,
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={destructive ? btnDangerOutline : btnPrimary}
          >
            {pending ? t.common.saving : confirmLabel}
          </button>
        </div>
      }
    >
      {body && <p className="text-sm text-zinc-400">{body}</p>}
    </Sheet>
  );
}
