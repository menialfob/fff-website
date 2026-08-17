"use client";

import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n";
import { Avatar } from "@/components/avatar";

const MAX_FACES = 5;

/**
 * Messenger-style seen receipt: the mini faces of members whose read cursor
 * sits at this message, right-aligned under it.
 */
export function SeenBy({
  members,
}: {
  members: { id: string; name: string; avatarUrl: string | null }[];
}) {
  const { t } = useI18n();
  if (members.length === 0) return null;
  const shown = members.slice(0, MAX_FACES);
  const overflow = members.length - shown.length;
  const names = members.map((m) => m.name).join(", ");

  return (
    <div
      className="mt-1 flex items-center justify-end gap-0.5 pr-1"
      title={fmt(t.chat.seenBy, { names })}
      aria-label={fmt(t.chat.seenBy, { names })}
    >
      {shown.map((m) => (
        <Avatar
          key={m.id}
          id={m.id}
          name={m.name}
          avatarUrl={m.avatarUrl}
          size="xs"
        />
      ))}
      {overflow > 0 && (
        <span className="text-[0.6rem] text-zinc-500">+{overflow}</span>
      )}
    </div>
  );
}
