"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, input, okText } from "@/components/ui";
import { ChatBubblesIcon } from "@/components/icons";
import { shareEventToChat } from "./actions";

/**
 * "Share to chat" button for a calendar event instance. Posts an event card
 * into a chosen channel and pushes everyone a signup deep link — the flow that
 * replaces pasting a dead private link into Messenger.
 */
export function ShareToChat({
  eventId,
  date,
  channels,
}: {
  eventId: string;
  date: string;
  channels: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  if (channels.length === 0) return null;

  function share() {
    if (!channelId) return;
    startTransition(async () => {
      const res = await shareEventToChat(eventId, date, channelId, note);
      if (!res.error) {
        setDone(true);
        setOpen(false);
        setNote("");
      }
    });
  }

  if (done) {
    return <p className={okText}>{t.chat.shared}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnSecondary}
      >
        <ChatBubblesIcon className="h-4 w-4" />
        {t.chat.shareToChat}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <p className="mb-2 text-sm font-semibold text-white">
        {t.chat.shareToChat}
      </p>
      {channels.length > 1 && (
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className={`${input} mb-2`}
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <input
        className={`${input} mb-2`}
        placeholder={t.chat.shareNote}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={4000}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={share}
          disabled={pending || !channelId}
          className={btnPrimary}
        >
          {t.chat.shareSend}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={btnSecondary}
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}
